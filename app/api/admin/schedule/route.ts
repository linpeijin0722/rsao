import { validVideoLeadDays } from "@/lib/video-booking-window";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
async function ok() {
  return isAdminSession((await cookies()).get("admin_session")?.value);
}
export async function GET() {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const db=adminSupabase();
  const [{data:holidays,error:e1},{data:method,error:e2},{data:settings,error:e3},{data:timeOffs,error:e4}]=await Promise.all([
    db.from("holidays").select("*").order("holiday_date"),
    db.from("consultation_methods").select("id").eq("code","video").single(),
    db.from("booking_system_settings").select("video_booking_enabled,video_booking_lead_days").eq("id",true).maybeSingle(),
    db.from("video_time_off").select("id,off_date,start_time,end_time,note").order("off_date").order("start_time"),
  ]);
  return e1||e2||e3||e4?NextResponse.json({error:e4?"無法讀取休假時段，請確認已執行 053_manual_results_and_video_time_off.sql":(e1||e2||e3)?.message},{status:500}):NextResponse.json({holidays,timeOffs:timeOffs||[],methodId:method?.id,videoBookingEnabled:settings?.video_booking_enabled!==false,videoBookingLeadDays:settings?.video_booking_lead_days??3});
}
export async function POST(r: NextRequest) {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json();
  if (b.action === "set_video_booking_lead_days") {
    if (!validVideoLeadDays(b.days)) return NextResponse.json({ error: "請輸入 0～36500 的整數天數" }, { status: 400 });
    const { error } = await adminSupabase().from("booking_system_settings").upsert({ id: true, video_booking_lead_days: b.days, updated_at: new Date().toISOString() });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, days: b.days });
  }
  if (b.action === "set_video_booking_enabled") {
    const { error } = await adminSupabase().from("booking_system_settings").upsert({ id: true, video_booking_enabled: Boolean(b.enabled), updated_at: new Date().toISOString() });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, enabled: Boolean(b.enabled) });
  }
  return NextResponse.json({error:"視訊諮詢僅使用個別日期手動開放時段"},{status:410});
}
export async function DELETE() {
  if (!(await ok())) return NextResponse.json({error:"未登入"},{status:401});
  return NextResponse.json({error:"每週固定開放功能已移除"},{status:410});
}
