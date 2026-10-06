import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
export async function GET(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 const {data,error}=await adminSupabase().from('consultation_return_schedules').select('id,booking_no,document_id,scheduled_for,status,sent_at,last_error,attempts,created_at').eq('booking_no',request.nextUrl.searchParams.get('bookingNo')||'').order('created_at',{ascending:false});
 return error?NextResponse.json({error:'排程記錄讀取失敗'},{status:500}):NextResponse.json({schedules:data||[]},{headers:{'Cache-Control':'no-store'}});
}
