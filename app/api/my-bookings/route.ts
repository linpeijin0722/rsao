import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
export async function GET() {
  const uid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!uid)
    return NextResponse.json(
      { error: "請重新從 LINE 開啟預約系統" },
      { status: 401 },
    );
  const db = adminSupabase(),
    _expired = await db.rpc("expire_unpaid_bookings"),
    { data: c } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", uid)
      .single(),
    { data } = await db
      .from("bookings")
      .select(
        "booking_no,slot_start,total_price,payment_method,payment_status,status,created_at,paid_at,expires_at,cancellation_reason,data_submitted_at,consultation_methods(title,code),booking_details(id,item_title,quantity,booking_detail_sub_items(sub_item_title))",
      )
      .eq("customer_id", c?.id || "")
      .order("created_at", { ascending: false });
  return NextResponse.json({ bookings: data || [] });
}
export async function POST(request: NextRequest) {
  const uid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!uid) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { bookingNo } = await request.json(),
    db = adminSupabase(),
    { data: c } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", uid)
      .single();
  const { data: booking } = await db.from("bookings").select("id,payment_status,status").eq("booking_no", bookingNo).eq("customer_id", c?.id || "").single();
  if (booking?.payment_status === "paid") return NextResponse.json({ error: "已付款的預約無法自行取消，如需調整請聯絡 LINE 助理" }, { status: 400 });
  if (!booking || !["pending_payment", "confirmed"].includes(booking.status)) return NextResponse.json({ error: "此預約已取消、完成或不存在" }, { status: 400 });
  const update: Record<string,string> = { status: "cancelled", cancellation_reason: "自行取消" };
  update.payment_status = "failed";
  const { error } = await db
    .from("bookings")
    .update(update).eq("id", booking.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
