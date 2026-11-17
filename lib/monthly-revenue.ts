import {taipeiDateKey,parseTaipeiDateTime} from './taipei-time';
export function revenueTestBooking(booking:any){
 const customer=Array.isArray(booking.customers)?booking.customers[0]:booking.customers;
 const line=String(customer?.line_display_name||'').normalize('NFKC').trim().toLowerCase();
 return ['nnn','peggy'].includes(line)||['Ubcbf61c20c7872905e3ca778af71e0fd','Ubb9918112f73f9d4be61a3bbf0e20c3b'].includes(customer?.line_user_id);
}
export function revenueBookingEligible(booking:any){return booking.payment_status==='paid'&&!['cancelled','canceled','expired','refunded'].includes(booking.status)&&!revenueTestBooking(booking);}
export function revenueMonthRange(month:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選擇有效的年份與月份');
 const [year,value]=month.split('-').map(Number);if(year<2000||year>2100)throw Error('年份超出可查詢範圍');
 return {start:new Date(Date.UTC(year,value-1,1)-8*3600000).toISOString(),end:new Date(Date.UTC(year,value,1)-8*3600000).toISOString()};
}
export function calculateMonthlyRevenue(bookings:any[],month:string,excludeVideoFee:boolean){
 revenueMonthRange(month);
 let text=0,video=0,textCount=0,videoCount=0,deducted=0,testCount=0,legacyDateCount=0;
 for(const booking of bookings){
  if(booking.payment_status!=='paid'||['cancelled','canceled','expired','refunded'].includes(booking.status))continue;
  const receipt=parseTaipeiDateTime(booking.paid_at||booking.created_at||'');
  if(!Number.isFinite(receipt.getTime())||taipeiDateKey(receipt).slice(0,7)!==month)continue;
  if(revenueTestBooking(booking)){testCount++;continue;}
  const method=Array.isArray(booking.consultation_methods)?booking.consultation_methods[0]:booking.consultation_methods;
  const amount=Number(booking.total_price);if(!Number.isFinite(amount)||amount<0||!['text','video'].includes(method?.code))continue;
  if(!booking.paid_at)legacyDateCount++;
  if(method.code==='text'){text+=amount;textCount++;}
  else{const raw=method.base_price,fee=raw!==null&&raw!==undefined&&Number.isFinite(Number(raw))?Math.max(0,Number(raw)):1200;const subtract=excludeVideoFee?Math.min(amount,fee):0;video+=amount-subtract;deducted+=subtract;videoCount++;}
 }
 return {month,text,video,total:text+video,textCount,videoCount,deducted,testCount,legacyDateCount};
}
