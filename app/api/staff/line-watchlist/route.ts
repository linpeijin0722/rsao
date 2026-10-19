import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
const userId = /^U[0-9a-f]{32}$/i;
async function auth() { return isAdminSession((await cookies()).get("admin_session")?.value); }
export async function GET() {
  if (!(await auth())) return NextResponse.json({error:"未登入"},{status:401});
  const {data,error}=await adminSupabase().from("line_watchlist").select("line_user_id,display_name,note,enabled,created_at,updated_at").order("display_name");
  return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({watchlist:data||[]});
}
export async function POST(request:NextRequest) {
  if (!(await auth())) return NextResponse.json({error:"未登入"},{status:401});
  const body=await request.json(), id=String(body.lineUserId||"").trim(), name=String(body.displayName||"").trim();
  if(!userId.test(id)||!name)return NextResponse.json({error:"請填寫正確的 LINE User ID 與顯示名稱"},{status:400});
  const {error}=await adminSupabase().from("line_watchlist").upsert({line_user_id:id,display_name:name,note:String(body.note||"").trim()||null,enabled:body.enabled!==false,updated_at:new Date().toISOString()});
  return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({ok:true});
}
export async function DELETE(request:NextRequest) {
  if (!(await auth())) return NextResponse.json({error:"未登入"},{status:401});
  const id=String(request.nextUrl.searchParams.get("lineUserId")||"");
  if(!userId.test(id))return NextResponse.json({error:"LINE User ID 不正確"},{status:400});
  const {error}=await adminSupabase().from("line_watchlist").delete().eq("line_user_id",id);
  return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({ok:true});
}
