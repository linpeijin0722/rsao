import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
import {taipeiDateKey} from '@/lib/taipei-time';
import {calculateMonthlyRevenue,revenueMonthRange} from '@/lib/monthly-revenue';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 try{
 const month=request.nextUrl.searchParams.get('month')||taipeiDateKey().slice(0,7),exclude=request.nextUrl.searchParams.get('excludeVideoFee')==='1';
 const {start,end}=revenueMonthRange(month),db=adminSupabase(),rows:any[]=[];
 // Fetch every page, independent of the staff list filters and Supabase's 1,000-row default.
 for(const column of ['paid_at','created_at'])for(let offset=0;;offset+=500){
  let query=db.from('bookings').select('id,paid_at,created_at,total_price,payment_status,status,customers(line_display_name,line_user_id),consultation_methods!inner(code,base_price)').eq('payment_status','paid').gte(column,start).lt(column,end).order('id').range(offset,offset+499);
  if(column==='created_at')query=query.is('paid_at',null);
  const {data,error}=await query;if(error)throw Error('營收查詢失敗，請稍後重試');rows.push(...data||[]);if((data||[]).length<500)break;
 }
 const unique=[...new Map(rows.map(row=>[row.id,row])).values()];
 return NextResponse.json(calculateMonthlyRevenue(unique,month,exclude),{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'營收查詢失敗'},{status:400});}
}
