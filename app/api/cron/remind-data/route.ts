import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex } from "@/lib/line-message";
export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"未授權"},{status:401});
  const db=adminSupabase(),before=new Date(Date.now()-2*60*60*1000).toISOString();
  const {data:bookings}=await db.from("bookings").select("booking_no,paid_at,customers(line_user_id),booking_details(id,booking_detail_profiles(profile_id))").eq("payment_status","paid").is("data_reminder_sent_at",null).lte("paid_at",before).neq("status","cancelled");
  const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;let sent=0;
  for(const booking of bookings||[]){const complete=Boolean(booking.booking_details?.length)&&booking.booking_details.every((d:any)=>d.booking_detail_profiles?.length);if(complete)continue;const customer=booking.customers as unknown as {line_user_id:string};try{await pushLineFlex(customer.line_user_id,"提醒您填寫問事資料",{type:"bubble",header:{type:"box",layout:"vertical",backgroundColor:"#FFF4E5",contents:[{type:"text",text:"溫馨提醒",weight:"bold",color:"#9A5B16",size:"xl"}]},body:{type:"box",layout:"vertical",spacing:"md",contents:[{type:"text",text:"想提醒您，這份資料是提供給阿嫂老師觀靈的重要依據。請完成填寫後，我們才能為您完成諮詢預約喔！",wrap:true,color:"#5B4A3E"}]},footer:{type:"box",layout:"vertical",contents:[{type:"button",style:"primary",height:"md",color:"#8A3045",action:{type:"uri",label:"立即填寫問事資料（必填）",uri:`${site}/booking-data?order=${encodeURIComponent(booking.booking_no)}`}}]}});await db.from("bookings").update({data_reminder_sent_at:new Date().toISOString()}).eq("booking_no",booking.booking_no);sent++}catch(error){console.error(error)}}
  return NextResponse.json({ok:true,sent});
}
