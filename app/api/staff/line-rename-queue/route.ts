import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";

export async function GET(request: Request) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value)) return NextResponse.json({ error: "未登入" }, { status: 401 });
  const db = adminSupabase();
  const url = new URL(request.url);
  const from = url.searchParams.get("from") || new Date().toISOString();
  const to = url.searchParams.get("to") || new Date(Date.now() + 31 * 86400000).toISOString();
  const { data, error } = await db.from("bookings").select("id,booking_no,slot_start,payment_status,status,customers(line_user_id,full_name),consultation_methods(code),booking_details(item_title)").eq("payment_status", "paid").neq("status", "cancelled").gte("slot_start", from).lte("slot_start", to).order("slot_start", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data || []).filter((b: any) => b.customers?.line_user_id && ["video", "text"].includes(b.consultation_methods?.code)).map((b: any) => ({ bookingId: b.id, bookingNo: b.booking_no, lineUserId: b.customers.line_user_id, fullName: b.customers.full_name || "", method: b.consultation_methods.code, slotStart: b.slot_start }));
  const response = NextResponse.json({ rows });
  response.headers.set("Access-Control-Allow-Origin", "https://chat.line.biz");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}
