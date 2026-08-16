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
        "booking_no,slot_start,total_price,payment_method,payment_status,status,created_at,expires_at,cancellation_reason,consultation_methods(title,code),booking_details(item_title)",
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
  await db
    .from("bookings")
    .update({
      status: "cancelled",
      payment_status: "failed",
      cancellation_reason: "自行取消",
    })
    .eq("booking_no", bookingNo)
    .eq("customer_id", c?.id || "")
    .eq("payment_status", "pending");
  return NextResponse.json({ ok: true });
}
