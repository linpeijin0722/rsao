import {NextRequest,NextResponse} from 'next/server';
import {adminSupabase} from '@/lib/supabase';
import {taipeiDateKey} from '@/lib/taipei-time';
import {resultReturnedAt} from '@/lib/staff-pending';

// Read-only bridge for the Apps Script reminder. No LINE messages are sent here.
export async function GET(request:NextRequest){
 if(!process.env.CRON_SECRET||request.headers.get('authorization')!==`Bearer ${process.env.CRON_SECRET}`)
  return NextResponse.json({error:'未授權'},{status:401});
 const start=new Date(`${taipeiDateKey()}T00:00:00+08:00`),end=new Date(start.getTime()+3*86400000);
 const db=adminSupabase();
 const {data,error}=await db.from('bookings').select('id,booking_no,slot_start,status,payment_status,data_submitted_at,consultation_result_returned_at,consultation_result_detected_at,customers(full_name,line_display_name),consultation_methods!inner(code),booking_details(google_document_id)')
  .eq('consultation_methods.code','video').eq('payment_status','paid').not('data_submitted_at','is',null)
  .gte('slot_start',start.toISOString()).lt('slot_start',end.toISOString());
 if(error)return NextResponse.json({error:error.message},{status:500});
 const orders=(data||[]).filter((b:any)=>!['cancelled','canceled'].includes(b.status)&&!resultReturnedAt(b)).map((b:any)=>{
  const c=Array.isArray(b.customers)?b.customers[0]:b.customers;
  return {bookingNo:b.booking_no,slotStart:b.slot_start,name:c?.full_name||'',lineName:c?.line_display_name||'',
   documentIds:[...new Set((b.booking_details||[]).map((d:any)=>d.google_document_id).filter(Boolean))]};
 }).filter(b=>!((b.name==='林珮均'&&b.lineName==='Peggy')||(b.name==='林啟恩'&&b.lineName==='Nnn')));
 return NextResponse.json({orders},{headers:{'Cache-Control':'no-store'}});
}
