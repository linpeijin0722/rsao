import {taipeiDateKey,taipeiDateTimeInput} from './taipei-time';
export function reminderEligible(b:{slot_start?:string|null;status?:string;payment_status?:string;expires_at?:string|null;data_submitted_at?:string|null},now=new Date()){
 if(!b.slot_start||b.data_submitted_at||['cancelled','expired'].includes(b.status||''))return false;
 if(b.payment_status==='pending'&&b.expires_at&&new Date(b.expires_at)<=now)return false;
 const start=new Date(b.slot_start);if(!Number.isFinite(start.getTime())||start<=now)return false;
 const delta=(Date.parse(taipeiDateKey(start)+'T00:00:00Z')-Date.parse(taipeiDateKey(now)+'T00:00:00Z'))/86400000;
 return delta>=0&&delta<=4;
}
export function isReminderNoon(now=new Date()){return taipeiDateTimeInput(now).slice(11,13)==='12';}
export function staffReminderText(input:any|any[],site:string){
 const rows=(Array.isArray(input)?[...input]:[input]).sort((a,b)=>Date.parse(a.slot_start)-Date.parse(b.slot_start));
 const name=(b:any)=>{const c=Array.isArray(b.customers)?b.customers[0]:b.customers;return c?.full_name||c?.line_display_name||'未填姓名'};
 const time=(b:any)=>taipeiDateTimeInput(b.slot_start).replace(/-/g,'/').replace('T',' ');
 const entries=rows.map((b,i)=>rows.length===1?`⏰ 視訊時間：${time(b)}\n👤 客人：${name(b)}\n❗ 尚未回傳問事資料`:`${['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'][i]||`${i+1}.`} ⏰ ${time(b)}\n   客人：${name(b)}\n   ❗ 問事資料未回傳`).join('\n\n');
 return `🚨【視訊將至，資料尚未回傳】\n\n視訊時間快到了！以下客人仍未回傳問事資料，請聯繫催填：\n\n${entries}\n\n👉 前往後台確認\n${site.replace(/\/$/,'')}/staff`;
}
