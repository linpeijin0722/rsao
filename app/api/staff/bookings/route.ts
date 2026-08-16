import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
export async function GET() {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { data, error } = await adminSupabase()
    .from("bookings")
    .select(
      "id,booking_no,slot_start,total_price,payment_method,payment_status,status,paid_at,created_at,customers(line_user_id,line_display_name),consultation_methods(code,title),booking_details(id,item_title,booking_detail_profiles(profile_id))",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data });
}
