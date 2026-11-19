import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {isAdminSession} from "@/lib/admin-session";
async function retired(){
 if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
 return NextResponse.json({error:"LINE 即時通知名單功能已移除"},{status:410});
}
export const GET=retired;
export const POST=retired;
export const DELETE=retired;
