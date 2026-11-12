import {createHash} from 'node:crypto';
import {resultReturnedAt,isStaffTestBooking} from './staff-pending';
import {taipeiDateKey,parseTaipeiDateTime,TAIPEI_TIME_ZONE} from './taipei-time';
export const resultReminderFields='id,booking_no,slot_start,status,payment_status,consultation_result_returned_at,consultation_result_manual_at,consultation_result_detected_at,customers(full_name,line_display_name),consultation_methods!inner(code)';
export const defaultResultReminderRecipients=['U3aa22cd5aeb99dc42e0300fbac78a062','Ubcbf61c20c7872905e3ca778af71e0fd','Ubb9918112f73f9d4be61a3bbf0e20c3b'];
export function resultReminderDays(){const value=process.env.RESULT_REMINDER_DAYS||'3';if(!['3','5'].includes(value))throw Error('RESULT_REMINDER_DAYS 只能為 3 或 5');return Number(value);}
export function resultReminderEnd(now:Date,days:number){return new Date(Date.parse(`${taipeiDateKey(now)}T00:00:00+08:00`)+days*86400000);}
export function resultReminderEligible(booking:any,now:Date,days:number){
 const method=Array.isArray(booking.consultation_methods)?booking.consultation_methods[0]:booking.consultation_methods;
 if(!booking.id||!booking.booking_no||method?.code!=='video'||booking.payment_status!=='paid'||['cancelled','canceled','expired','refunded'].includes(booking.status)||resultReturnedAt(booking)||isStaffTestBooking(booking))return false;
 const date=parseTaipeiDateTime(booking.slot_start||'');
 if(!Number.isFinite(date.getTime())||date<=now||date>=resultReminderEnd(now,days))return false;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TAIPEI_TIME_ZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).split(':').map(Number);
 return parts[0]*60+parts[1]>210;
}
export function resultReminderText(booking:any){
 const customer=Array.isArray(booking.customers)?booking.customers[0]:booking.customers;
 const name=customer?.full_name||'',line=customer?.line_display_name||'';
 const label=line&&name&&line!==name?`${line}（${name}）`:line||name||'未填姓名';
 const date=new Intl.DateTimeFormat('zh-TW',{timeZone:TAIPEI_TIME_ZONE,month:'numeric',day:'numeric',weekday:'short',hour:'numeric',minute:'2-digit',hour12:true}).format(parseTaipeiDateTime(booking.slot_start));
 return `📌 諮詢結果回傳提醒\n\n請確認 ${date} - ${label} 諮詢結果是否尚未回傳\n訂單：${booking.booking_no}`;
}
export function resultReminderRetryKey(bookingId:string,date:string,recipient:string){const hash=createHash('sha256').update(`result-reminder:${bookingId}:${date}:${recipient}`).digest('hex');return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;}
