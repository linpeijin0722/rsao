import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { videoBookingWindow } from "@/lib/video-consultation-duration";
export const dynamic = "force-dynamic";
export async function GET(r:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
  const date=r.nextUrl.searchParams.get("date")||"",id=r.nextUrl.searchParams.get("methodId")||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!id)return NextResponse.json({error:"請選擇日期與諮詢方式"},{status:400});
  const start=new Date(`${date}T00:00:00+08:00`);
  if(!Number.isFinite(start.getTime()))return NextResponse.json({error:"日期不正確"},{status:400});
  const end=new Date(start.getTime()+86400000),db=adminSupabase();
  try{
    const [{data,error},{data:bookings,error:bookingError}]=await Promise.all([
      db.rpc("get_available_slots",{p_method_id:id,p_days:180}),
      db.from("bookings").select("id,booking_no,slot_start,total_price,customers(full_name,line_display_name)").eq("consultation_method_id",id).neq("status","cancelled").gte("slot_start",start.toISOString()).lt("slot_start",end.toISOString()).order("slot_start"),
    ]);
    if(error||bookingError)throw error||bookingError;
    const dayFormat=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei"});
    const clockFormat=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false});
    const open=[...new Set((data||[]).filter((slot:any)=>dayFormat.format(new Date(slot.slot_start))===date).map((slot:any)=>clockFormat.format(new Date(slot.slot_start))))];
    const booked=(bookings||[]).filter((booking:any)=>booking.slot_start).map((booking:any)=>({id:booking.id,bookingNo:booking.booking_no,customerName:(Array.isArray(booking.customers)?booking.customers[0]:booking.customers)?.full_name||(Array.isArray(booking.customers)?booking.customers[0]:booking.customers)?.line_display_name||"未提供姓名",start:booking.slot_start,...videoBookingWindow(booking.slot_start,Number(booking.total_price||0))}));
    return NextResponse.json({open,bookings:booked},{headers:{"Cache-Control":"no-store, max-age=0"}});
  }catch(error){return NextResponse.json({error:error&&typeof error==="object"&&"message" in error?String(error.message):"無法讀取當日時段"},{status:500});}
}
