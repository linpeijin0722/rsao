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
      "id,booking_no,slot_start,total_price,payment_method,payment_status,status,paid_at,created_at,customers(line_user_id,line_display_name),consultation_methods(id,code,title,base_price),booking_details(id,item_id,item_title,booking_detail_profiles(profile_id))",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data });
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
  if (Array.isArray(body.itemIds) && body.itemIds.length) {
    const { data: items } = await db
      .from("booking_items")
      .select("id,title,price")
      .in("id", body.itemIds)
      .eq("is_active", true);
    await db.from("booking_details").delete().eq("booking_id", b.id);
    if (items?.length) {
      await db
        .from("booking_details")
        .insert(
          items.map((i) => ({
            booking_id: b.id,
            item_id: i.id,
            item_title: i.title,
            unit_price: i.price,
            quantity: 1,
            line_total: i.price,
          })),
        );
      const subtotal = items.reduce((n, i) => n + i.price, 0),
        method = b.consultation_methods as unknown as { base_price: number };
      await db
        .from("bookings")
        .update({
          subtotal,
          total_price: subtotal + (method.base_price || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);
      titles = items.map((i) => i.title);
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
            uri: `${site}/my-bookings`,
          },
        },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
