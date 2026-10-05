/** Same amount thresholds as the consultation document. */
export function videoConsultationMinutes(amount:number){
  if(amount<=5700)return 30;
  if(amount<=7900)return 35;
  return 40+Math.floor((amount-7900)/1200)*5;
}
export function videoBookingWindow(slotStart:string,amount:number){
  const start=new Date(slotStart).getTime(),minutes=videoConsultationMinutes(amount);
  return {minutes,end:new Date(start+minutes*60000).toISOString(),bufferEnd:new Date(start+Math.max(50,minutes+10)*60000).toISOString()};
}
