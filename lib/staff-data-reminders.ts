import {taipeiDateKey,taipeiDateTimeInput} from './taipei-time';
export function reminderEligible(b:{slot_start?:string|null;status?:string;payment_status?:string;expires_at?:string|null;data_submitted_at?:string|null},now=new Date()){
 if(!b.slot_start||b.data_submitted_at||['cancelled','expired'].includes(b.status||''))return false;
 if(b.payment_status==='pending'&&b.expires_at&&new Date(b.expires_at)<=now)return false;
 const start=new Date(b.slot_start);if(!Number.isFinite(start.getTime())||start<=now)return false;
 const delta=(Date.parse(taipeiDateKey(start)+'T00:00:00Z')-Date.parse(taipeiDateKey(now)+'T00:00:00Z'))/86400000;
 return delta>=0&&delta<=4;
}
export function isReminderNoon(now=new Date()){return taipeiDateTimeInput(now).slice(11,13)==='12';}
export function staffReminderText(b:any,site:string){const customer=Array.isArray(b.customers)?b.customers[0]:b.customers;return `【視訊諮詢資料未填寫】\n客人：${customer?.full_name||customer?.line_display_name||'未填姓名'}\n訂單：${b.booking_no}\n視訊時間：${taipeiDateTimeInput(b.slot_start).replace('T',' ')}（台灣時間）\n請客服確認此筆訂單，提醒客人填寫問事資料。\n${site.replace(/\/$/,'')}/staff`;}
