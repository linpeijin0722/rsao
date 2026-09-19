import { NextRequest,NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { paymentSettings } from "@/lib/payment-mode";
import { pushLineText } from "@/lib/line-message";

export async function GET(request:NextRequest){
  try{
    const lineUid=verifyLineSession((await cookies()).get("line_session")?.value);if(!lineUid)return NextResponse.json({error:"LINE 登入已失效"},{status:401});
    const bookingNo=request.nextUrl.searchParams.get("bookingNo")||"",db=adminSupabase();
    const {data:customer}=await db.from("customers").select("id").eq("line_user_id",lineUid).single();
    const {data:booking,error}=await db.from("bookings").select("booking_no,total_price,payment_status,status,expires_at,transfer_account_last5,transfer_reported_at,transfer_time,transfer_amount,transfer_status").eq("booking_no",bookingNo).eq("customer_id",customer?.id||"").single();
    if(error||!booking)return NextResponse.json({error:"找不到這筆訂單"},{status:404});
    const settings=await paymentSettings();return NextResponse.json({booking,settings});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"讀取轉帳資料失敗"},{status:500})}
}
export async function POST(request:NextRequest){
  try{
    const lineUid=verifyLineSession((await cookies()).get("line_session")?.value);if(!lineUid)return NextResponse.json({error:"LINE 登入已失效"},{status:401});
    const body=await request.json(),last5=String(body.last5||"").trim(),amount=Number(body.amount),transferDate=String(body.transferDate||"").trim(),transferTime=new Date(`${transferDate}T12:00:00+08:00`);
    if(!/^\d{5}$/.test(last5))return NextResponse.json({error:"請輸入轉出帳號末五碼"},{status:400});
    if(!Number.isFinite(amount)||amount<=0)return NextResponse.json({error:"請輸入實際轉帳金額"},{status:400});
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(transferDate)||Number.isNaN(transferTime.getTime())||transferDate>today)return NextResponse.json({error:"請選擇正確的轉帳日期"},{status:400});
    const db=adminSupabase(),{data:customer}=await db.from("customers").select("id,full_name,line_display_name").eq("line_user_id",lineUid).single();
    const {data:booking}=await db.from("bookings").select("id,total_price,payment_status,status").eq("booking_no",String(body.bookingNo||"")).eq("customer_id",customer?.id||"").single();
    if(!booking)return NextResponse.json({error:"找不到這筆訂單"},{status:404});if(booking.payment_status==="paid")return NextResponse.json({error:"此訂單已付款"},{status:400});
    if(amount!==Number(booking.total_price))return NextResponse.json({error:`轉帳金額應為 NT$ ${Number(booking.total_price).toLocaleString("zh-TW")}`},{status:400});
    const {error}=await db.from("bookings").update({transfer_account_last5:last5,transfer_time:transferTime.toISOString(),transfer_amount:amount,transfer_reported_at:new Date().toISOString(),transfer_status:"reported",expires_at:new Date(Date.now()+72*60*60*1000).toISOString(),updated_at:new Date().toISOString()}).eq("id",booking.id);
    if(error)throw error;
    const targets=String(process.env.LINE_STAFF_NOTIFICATION_TARGETS||process.env.LINE_CUSTOMER_SERVICE_USER_ID||"").split(",").map(value=>value.trim()).filter(Boolean);
    if(targets.length){
      const customerName=customer?.full_name||customer?.line_display_name||"用戶";
      const message=`${customerName}已轉帳，末五碼：${last5}\n訂單：${String(body.bookingNo||"")}\n金額：NT$ ${amount.toLocaleString("zh-TW")}\n日期：${transferDate}`;
      await Promise.allSettled(targets.map(target=>pushLineText(target,message)));
    }
    return NextResponse.json({ok:true});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"回報轉帳失敗"},{status:500})}
}
