import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
export async function POST(request:NextRequest){
 if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
 const body=await request.json(),id=String(body.lineUserId||""),name=String(body.displayName||"").trim();
 if(!/^U[0-9a-f]{32}$/i.test(id)||!name)return NextResponse.json({error:"LINE 名稱資料不完整"},{status:400});
 const db=adminSupabase(),now=new Date().toISOString();
 const {error}=await db.from("customers").update({line_display_name:name,updated_at:now}).eq("line_user_id",id);
 if(error)return NextResponse.json({error:error.message},{status:500});
 await db.from("line_contacts").upsert({line_user_id:id,display_name:name,updated_at:now});
 return NextResponse.json({ok:true});
}
