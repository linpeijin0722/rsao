import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
import {syncBookingCalendar} from '@/lib/google-calendar';
export const maxDuration=60;
async function authorized(){return isAdminSession((await cookies()).get('admin_session')?.value)}
async function upcoming(){const {data,error}=await adminSupabase().from('bookings').select('booking_no,slot_start,google_calendar_event_id,customers(full_name,line_display_name),consultation_methods!inner(code)').eq('consultation_methods.code','video').eq('payment_status','paid').neq('status','cancelled').not('google_calendar_event_id','is',null).gte('slot_start',new Date().toISOString()).order('slot_start');if(error)throw new Error('查詢預約失敗');return data||[];}
export async function GET(){if(!await authorized())return NextResponse.json({error:'請先登入後台'},{status:401});try{return NextResponse.json({calendarId:process.env.GOOGLE_CALENDAR_ID||'',bookings:await upcoming()})}catch{return NextResponse.json({error:'查詢行事曆同步資料失敗'},{status:500})}}
export async function POST(request:NextRequest){if(!await authorized())return NextResponse.json({error:'請先登入後台'},{status:401});try{
 if(process.env.GOOGLE_CALENDAR_ID?.trim()!=='ginshan820@gmail.com')return NextResponse.json({error:'請先將GOOGLE_CALENDAR_ID設為ginshan820@gmail.com並重新部署'},{status:400});
 const body=await request.json(),numbers:string[]=Array.isArray(body.bookingNos)?Array.from(new Set<string>(body.bookingNos.map(String))):[];
 if(!numbers.length||numbers.length>10)return NextResponse.json({error:'每次請同步1～10筆訂單'},{status:400});const eligible=await upcoming(),allow=new Set(eligible.map(b=>b.booking_no));if(numbers.some(no=>!allow.has(no)))return NextResponse.json({error:'訂單狀態已變動，請重新整理'},{status:409});
 const results=[];for(const no of numbers){try{await syncBookingCalendar(no);results.push({bookingNo:no,ok:true})}catch{results.push({bookingNo:no,ok:false,error:'同步失敗，請確認行事曆存取權限及活動是否存在'})}}
 return NextResponse.json({ok:results.every(r=>r.ok),results});
 }catch{return NextResponse.json({error:'行事曆同步失敗'},{status:500})}}
