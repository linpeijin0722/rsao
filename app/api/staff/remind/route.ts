import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { bookingStatusFlex, pushLineFlex } from "@/lib/line-message";
export async function POST(r: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { bookingNo, reopen = false } = await r.json(),
    db = adminSupabase(),
    { data: b } = await db
      .from("bookings")
      .select("id,booking_no,payment_status,data_submitted_at,total_price,slot_start,customers(line_user_id),consultation_methods(code),booking_details(id,item_title,booking_detail_sub_items(sub_item_title))")
      .eq("booking_no", bookingNo)
      .single();
  if (!b) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  if (b.payment_status !== "paid") return NextResponse.json({ error: "尚未付款，無法傳送填寫通知" }, { status: 400 });
  const c = b.customers as unknown as { line_user_id: string },
    site = process.env.NEXT_PUBLIC_SITE_URL || r.nextUrl.origin;
  if (reopen) {
    if (!b.data_submitted_at) return NextResponse.json({ error: "這筆訂單已重新開放填寫，未重複發送通知" }, { status: 409 });
    const { data: reopened, error } = await db.from("bookings").update({ data_submitted_at: null, updated_at: new Date().toISOString() }).eq("id", b.id).eq("data_submitted_at", b.data_submitted_at).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: "無法重新開放填寫，請稍後再試" }, { status: 500 });
    if (!reopened) return NextResponse.json({ error: "這筆訂單已由其他操作重新開放，未重複發送通知" }, { status: 409 });
  }
  const method = Array.isArray(b.consultation_methods) ? b.consultation_methods[0] : b.consultation_methods,
    items = (b.booking_details || []).map((detail: any) => [detail.item_title, ...(detail.booking_detail_sub_items || []).map((sub: any) => sub.sub_item_title)].filter(Boolean).join("｜"));
  try {
    await pushLineFlex(c.line_user_id, "請填寫諮詢者資料", bookingStatusFlex({ status: "data_required", bookingNo: b.booking_no, method: method?.code || "text", total: Number(b.total_price), slotStart: b.slot_start || undefined, items, site }));
  } catch (error) {
    if (reopen && b.data_submitted_at) await db.from("bookings").update({ data_submitted_at: b.data_submitted_at }).eq("id", b.id);
    throw error;
  }
  return NextResponse.json({ ok: true, reopened: Boolean(reopen) });
}
