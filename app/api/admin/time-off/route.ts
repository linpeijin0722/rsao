import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { validateTimeOff } from "@/lib/video-time-off";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value)) return NextResponse.json({error:"未登入"},{status:401});
  const body = await request.json();
  const invalid = validateTimeOff(body.date, body.start, body.end);
  if (invalid || (body.id && !uuid.test(body.id))) return NextResponse.json({error:invalid || "休假紀錄不正確"},{status:400});
  const db = adminSupabase(), record = {off_date:body.date,start_time:body.start,end_time:body.end,note:String(body.note || "").trim().slice(0,500) || null};
  const query = body.id ? db.from("video_time_off").update(record).eq("id",body.id) : db.from("video_time_off").insert(record);
  const {data,error} = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({error:error.message},{status:500});
  if (!data) return NextResponse.json({error:"紀錄已不存在，請重新整理"},{status:404});
  return NextResponse.json({ok:true});
}
export async function DELETE(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value)) return NextResponse.json({error:"未登入"},{status:401});
  const id = request.nextUrl.searchParams.get("id") || "";
  if (!uuid.test(id)) return NextResponse.json({error:"缺少正確休假編號"},{status:400});
  const {error} = await adminSupabase().from("video_time_off").delete().eq("id",id);
  return error ? NextResponse.json({error:error.message},{status:500}) : NextResponse.json({ok:true});
}
