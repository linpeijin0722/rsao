import { NextResponse } from "next/server";
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
    { data: c } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", uid)
      .single(),
    { data } = await db
      .from("bookings")
      .select(
        "booking_no,slot_start,total_price,payment_status,status,created_at,consultation_methods(title)",
      )
      .eq("customer_id", c?.id || "")
      .order("created_at", { ascending: false });
  return NextResponse.json({ bookings: data || [] });
}
