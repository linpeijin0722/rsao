import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
export async function GET(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 const {data,error}=await adminSupabase().from('consultation_return_schedules').select('id,booking_no,document_id,scheduled_for,status,sent_at,last_error,attempts,created_at').eq('booking_no',request.nextUrl.searchParams.get('bookingNo')||'').order('created_at',{ascending:false});
 return error?NextResponse.json({error:'排程記錄讀取失敗'},{status:500}):NextResponse.json({schedules:data||[]},{headers:{'Cache-Control':'no-store'}});
}
export async function PATCH(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.id!=='string'||!body.bookingNo||!/^[0-9a-f-]{36}$/i.test(body.id))return NextResponse.json({error:'缺少正確的排程及訂單編號'},{status:400});
 // 與排程工作者的 pending → sending 更新競爭同一筆資料，只有一方能成功。
 const {data,error}=await adminSupabase().from('consultation_return_schedules').update({status:'cancelled'})
  .eq('id',body.id).eq('booking_no',body.bookingNo).eq('status','pending').select('id').maybeSingle();
 if(error)return NextResponse.json({error:'取消失敗，請重新讀取排程後再試'},{status:500});
 if(!data)return NextResponse.json({error:'此排程已開始發送、已送出或已取消，無法再取消。請確認最新狀態。'},{status:409});
 return NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
}
