import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex } from "@/lib/line-message";
export async function GET() {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { data, error } = await adminSupabase()
    .from("bookings")
    .select(
      "id,booking_no,slot_start,total_price,payment_method,payment_status,collection_source,data_submitted_at,status,cancellation_reason,paid_at,created_at,customers(id,line_user_id,line_display_name,line_picture_url,full_name,gender,full_address,birth_date,lunar_birth_text,zodiac,birth_shichen),consultation_methods(id,code,title,base_price),booking_details(id,item_id,item_title,quantity,booking_detail_sub_items(sub_item_id,sub_item_title),booking_detail_profiles(profile_id,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data)),booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data),booking_answer_participants(position,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data))))",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data });
}
export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(), { bookingNo, action } = body;
  if (action === "update_answer") {
    if(!body.answerId||!body.profileId)return NextResponse.json({error:"缺少問事資料"},{status:400});
    const {error}=await adminSupabase().from("booking_consultation_answers").update({profile_id:body.profileId,questions:(body.questions||[]).slice(0,3),updated_at:new Date().toISOString()}).eq("id",body.answerId);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if (action === "update_consultation_profile") {
    const db=adminSupabase(),allowed=["name","relationship_detail","gender","birth_date","lunar_birth_text","zodiac","birth_shichen","address","death_date","lunar_death_text","death_shichen","notes","owner_profile_id","photo_data"];
    if (!body?.profileId) return NextResponse.json({error:"缺少資料"},{status:400});
    const profileUpdate=Object.fromEntries(allowed.filter(k=>k in body.profile).map(k=>[k,body.profile[k]||null]));
    const {error}=await db.from("consultation_profiles").update({...profileUpdate,updated_at:new Date().toISOString()}).eq("id",body.profileId);
    if(body.answerId)await db.from("booking_consultation_answers").update({questions:(body.questions||[]).slice(0,3),updated_at:new Date().toISOString()}).eq("id",body.answerId);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if (action !== "mark_paid") return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  const db = adminSupabase();
  const { data, error } = await db.from("bookings").update({
    payment_status: "paid",
    status: "confirmed",
    collection_source: "manual",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("booking_no", bookingNo).neq("status", "cancelled").select("booking_no").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "找不到訂單" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
export async function PATCH(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(),
    db = adminSupabase(),
    { data: b } = await db
      .from("bookings")
      .select(
        "id,booking_no,consultation_method_id,customers(line_user_id),consultation_methods(code,base_price)",
      )
      .eq("booking_no", body.bookingNo)
      .single();
  if (!b) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  if (body.slotStart) {
    const start = new Date(body.slotStart),
      end = new Date(start.getTime() + 1800000);
    await db
      .from("bookings")
      .update({
        slot_start: start.toISOString(),
        slot_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id);
  }
  let titles: string[] = [];
  if (Array.isArray(body.lines) && body.lines.length) {
    const itemIds = body.lines.map((x: { itemId: string }) => x.itemId),
      subIds = body.lines
        .map((x: { subId?: string }) => x.subId)
        .filter(Boolean);
    const { data: items } = await db
      .from("booking_items")
      .select("id,title,price")
      .in("id", itemIds)
      .eq("is_active", true);
    const { subItems } = await (async () => {
      const { data } = subIds.length
        ? await db
            .from("sub_items")
            .select("id,item_id,title,price")
            .in("id", subIds)
        : { data: [] };
      return { subItems: data || [] };
    })();
    await db.from("booking_details").delete().eq("booking_id", b.id);
    if (items?.length) {
      let subtotal = 0;
      for (const line of body.lines as {
        itemId: string;
        subId?: string;
        qty: number;
      }[]) {
        const item = items.find((i) => i.id === line.itemId);
        if (!item) continue;
        const sub = subItems.find(
            (s) => s.id === line.subId && s.item_id === item.id,
          ),
          qty = Math.max(1, Number(line.qty) || 1),
          unit = sub?.price ?? item.price;
        const { data: detail } = await db
          .from("booking_details")
          .insert({
            booking_id: b.id,
            item_id: item.id,
            item_title: item.title,
            unit_price: unit,
            quantity: qty,
            line_total: unit * qty,
          })
          .select("id")
          .single();
        if (sub && detail)
          await db.from("booking_detail_sub_items").insert({
            booking_detail_id: detail.id,
            sub_item_id: sub.id,
            sub_item_title: sub.title,
            unit_price: sub.price,
            quantity: qty,
            line_total: sub.price * qty,
          });
        subtotal += unit * qty;
        titles.push(`${sub?.title || item.title} x${qty}`);
      }
      const method = b.consultation_methods as unknown as {
        base_price: number;
      };
      await db
        .from("bookings")
        .update({
          subtotal,
          total_price: subtotal + (method.base_price || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);
    }
  }
  if (!titles.length) {
    const { data: d } = await db
      .from("booking_details")
      .select("item_title")
      .eq("booking_id", b.id);
    titles = (d || []).map((x) => x.item_title);
  }
  const c = b.customers as unknown as { line_user_id: string },
    site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
    time = body.slotStart
      ? new Date(body.slotStart).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
        })
      : "文字諮詢";
  await pushLineFlex(c.line_user_id, "預約已變更", {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#8A3045",
      contents: [
        {
          type: "text",
          text: "預約已變更",
          color: "#FFFFFF",
          weight: "bold",
          size: "xl",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `訂單編號：${b.booking_no}`,
          wrap: true,
          weight: "bold",
        },
        { type: "text", text: `變更後時間：${time}`, wrap: true },
        { type: "text", text: `變更後項目：${titles.join("、")}`, wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#8A3045",
          action: {
            type: "uri",
            label: "查看預約",
            uri: `${site}/my-bookings?order=${encodeURIComponent(b.booking_no)}`,
          },
        },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
