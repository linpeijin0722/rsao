import {NextRequest,NextResponse} from "next/server";
import {adminSupabase} from "@/lib/supabase";
import {sendPaidBookingNotification} from "@/lib/payment-notification";

export const dynamic="force-dynamic";

export async function GET(request:NextRequest){return run(request)}
export async function POST(request:NextRequest){return run(request)}

async function run(request:NextRequest){
  if(!process.env.CRON_SECRET||request.headers.get("authorization")!==`Bearer ${process.env.CRON_SECRET}`)return NextResponse.json({error:"未授權"},{status:401});
  const db=adminSupabase(),now=new Date().toISOString();
  const {data,error}=await db.from("bookings").select("booking_no").eq("payment_status","paid").in("payment_notification_status",["pending","failed"]).lt("payment_notification_attempts",10).lte("payment_notification_next_retry_at",now).limit(20);
  if(error)return NextResponse.json({error:error.message},{status:500});
  const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin,results=[];
  for(const booking of data||[])results.push({bookingNo:booking.booking_no,...await sendPaidBookingNotification(booking.booking_no,site)});
  return NextResponse.json({ok:true,processed:results.length,results});
}
