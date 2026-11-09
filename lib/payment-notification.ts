import { adminSupabase } from "@/lib/supabase";
import { bookingFlex, pushLineFlex } from "@/lib/line-message";

const nextRetryAt=(attempts:number)=>new Date(Date.now()+Math.min(60,5*Math.max(1,attempts))*60_000).toISOString();

export async function sendPaidBookingNotification(bookingNo:string,site:string){
  const db=adminSupabase();
  const {data:booking,error}=await db.from("bookings").select("booking_no,total_price,slot_start,slot_end,payment_status,payment_notified_at,payment_notification_attempts,customers(line_user_id),consultation_methods(code),booking_details(item_title,quantity,booking_detail_sub_items(sub_item_title))").eq("booking_no",bookingNo).single();
  if(error||!booking)throw new Error(error?.message||"找不到付款訂單");
  if(booking.payment_status!=="paid")throw new Error("訂單尚未付款");
  if(booking.payment_notified_at)return {sent:true,alreadySent:true};
  const customer=booking.customers as unknown as {line_user_id:string}|null;
  if(!customer?.line_user_id||String(customer.line_user_id).startsWith("WEB_")){
    await db.from("bookings").update({payment_notification_status:"skipped",payment_notification_error:customer?.line_user_id?"公開網站訂單不傳送 LINE 訊息":"此用戶沒有 LINE UID",payment_notification_next_retry_at:null}).eq("booking_no",bookingNo);
    return {sent:false,skipped:true};
  }
  const attempts=Number(booking.payment_notification_attempts||0)+1;
  const stamp=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
  const slot=booking.slot_start&&booking.slot_end?`${stamp(booking.slot_start)}/${stamp(booking.slot_end)}`:undefined;
  const method=booking.consultation_methods as unknown as {code:string};
  const items=(booking.booking_details||[]).map((detail:any)=>{
    const sub=detail.booking_detail_sub_items?.[0]?.sub_item_title||"";
    const cleanSub=String(sub).replace(/[（(]?無論幾位[^）)]*[）)]?/g,"").replace(/\s+/g," ").trim();
    return `${detail.item_title}${cleanSub?`｜${cleanSub}`:""} x${Math.max(1,Number(detail.quantity)||1)}`;
  });
  try{
    await pushLineFlex(customer.line_user_id,"已付款｜請填寫問事資料",bookingFlex({bookingNo, total:Number(booking.total_price),method:method?.code||"text",slot,slotStart:booking.slot_start||undefined,items,site}));
    await db.from("bookings").update({payment_notified_at:new Date().toISOString(),payment_notification_status:"sent",payment_notification_error:null,payment_notification_attempts:attempts,payment_notification_last_attempt_at:new Date().toISOString(),payment_notification_next_retry_at:null}).eq("booking_no",bookingNo);
    return {sent:true};
  }catch(error){
    const message=error instanceof Error?error.message:"LINE 訊息發送失敗";
    await db.from("bookings").update({payment_notification_status:attempts>=10?"failed":"pending",payment_notification_error:message.slice(0,1000),payment_notification_attempts:attempts,payment_notification_last_attempt_at:new Date().toISOString(),payment_notification_next_retry_at:attempts>=10?null:nextRetryAt(attempts)}).eq("booking_no",bookingNo);
    return {sent:false,error:message,queued:attempts<10};
  }
}
