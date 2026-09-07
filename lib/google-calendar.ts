import crypto from "node:crypto";
import { adminSupabase } from "@/lib/supabase";

const email = (process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL || "").trim();
const privateKey = (process.env.GOOGLE_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const calendarId = (process.env.GOOGLE_CALENDAR_ID || "").trim();
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

async function accessToken() {
  if (!email || !privateKey || !calendarId) throw new Error("Google Calendar 環境變數尚未設定完整");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ iss: email, scope: "https://www.googleapis.com/auth/calendar", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const sign = crypto.createSign("RSA-SHA256"); sign.update(unsigned); sign.end();
  const assertion = `${unsigned}.${sign.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || "無法取得 Google Calendar 權限");
  return result.access_token as string;
}
async function google(url:string, token:string, init:RequestInit={}) {
  const response=await fetch(url,{...init,headers:{authorization:`Bearer ${token}`,"content-type":"application/json",...(init.headers||{})}});
  const result=response.status===204?{}:await response.json();
  if(!response.ok)throw new Error(result.error?.message||"Google Calendar API 操作失敗");
  return result;
}
const one=(value:any)=>Array.isArray(value)?value[0]:value;
const itemLines=(details:any[])=>details.flatMap((detail:any)=>{
  const subs=(detail.booking_detail_sub_items||[]).map((x:any)=>x.sub_item_title).filter(Boolean);
  const title=[detail.item_title,...subs].filter(Boolean).join("｜");
  return Array.from({length:Math.max(1,Number(detail.quantity)||1)},()=>title);
});

export async function syncBookingCalendar(bookingNo:string) {
  const db=adminSupabase();
  const {data:booking,error}=await db.from("bookings").select("id,booking_no,slot_start,slot_end,payment_status,status,cancellation_reason,google_calendar_event_id,customers(full_name),consultation_methods(code,title,duration_minutes),booking_details(item_title,quantity,booking_detail_sub_items(sub_item_title))").eq("booking_no",bookingNo).single();
  if(error||!booking)throw new Error(error?.message||"找不到訂單");
  const method=one(booking.consultation_methods), customer=one(booking.customers);
  const shouldExist=method?.code==="video"&&booking.payment_status==="paid"&&booking.status!=="cancelled"&&!!booking.slot_start;
  const token=await accessToken();
  if(!shouldExist){
    if(booking.google_calendar_event_id){
      try{await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.google_calendar_event_id)}`,token,{method:"DELETE"});}catch(error){console.error("刪除 Calendar 活動失敗",error)}
      await db.from("bookings").update({google_calendar_event_id:null,updated_at:new Date().toISOString()}).eq("id",booking.id);
    }
    return;
  }
  const start=new Date(booking.slot_start), end=booking.slot_end?new Date(booking.slot_end):new Date(start.getTime()+Math.max(1,Number(method.duration_minutes)||30)*60000);
  const items=itemLines(booking.booking_details||[]);
  const description=[`訂單編號：${booking.booking_no}`,"","諮詢項目：",...items.map((x:string)=>`・${x}`)].join("\n");
  const event={summary:`${customer?.full_name||"未填姓名"}｜視訊諮詢`,description,start:{dateTime:start.toISOString(),timeZone:"Asia/Taipei"},end:{dateTime:end.toISOString(),timeZone:"Asia/Taipei"},reminders:{useDefault:false,overrides:[{method:"popup",minutes:15}]}};
  let result:any;
  if(booking.google_calendar_event_id){
    result=await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(booking.google_calendar_event_id)}`,token,{method:"PATCH",body:JSON.stringify(event)});
  }else{
    result=await google(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,token,{method:"POST",body:JSON.stringify(event)});
  }
  if(result.id&&result.id!==booking.google_calendar_event_id)await db.from("bookings").update({google_calendar_event_id:result.id,updated_at:new Date().toISOString()}).eq("id",booking.id);
}
