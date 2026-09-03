import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { bookingStatusFlex, pushLineFlex } from "@/lib/line-message";
export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({error:"未授權"},{status:401});
  const db=adminSupabase(),before=new Date(Date.now()-2*60*60*1000).toISOString();
  const {data:bookings}=await db.from("bookings").select("booking_no,paid_at,total_price,slot_start,customers(line_user_id),consultation_methods(code),booking_details(id,item_title,booking_detail_sub_items(sub_item_title),booking_detail_profiles(profile_id))").eq("payment_status","paid").is("data_reminder_sent_at",null).lte("paid_at",before).neq("status","cancelled");
  const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;let sent=0;
  for(const booking of bookings||[]){const complete=Boolean(booking.booking_details?.length)&&booking.booking_details.every((d:any)=>d.booking_detail_profiles?.length);if(complete)continue;const customer=booking.customers as unknown as {line_user_id:string},method=booking.consultation_methods as unknown as {code:string},items=(booking.booking_details||[]).map((detail:any)=>[detail.item_title,...(detail.booking_detail_sub_items||[]).map((sub:any)=>sub.sub_item_title)].filter(Boolean).join("｜"));try{await pushLineFlex(customer.line_user_id,"提醒您填寫問事資料",bookingStatusFlex({status:"data_required",bookingNo:booking.booking_no,method:method?.code||"text",total:Number(booking.total_price),slotStart:booking.slot_start,items,site}));await db.from("bookings").update({data_reminder_sent_at:new Date().toISOString()}).eq("booking_no",booking.booking_no);sent++}catch(error){console.error(error)}}
  return NextResponse.json({ok:true,sent});
}
