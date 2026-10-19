import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminSession } from '@/lib/admin-session';
import { adminSupabase } from '@/lib/supabase';
import { buildRenameQueue } from '@/lib/line-rename-queue';
export const dynamic='force-dynamic';
export async function GET() {
  if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
  const db=adminSupabase(), bookings:any[]=[];
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('bookings').select('id,booking_no,created_at,slot_start,payment_status,status,consultation_result_returned_at,consultation_result_manual_at,consultation_result_detected_at,customers(line_user_id,full_name,line_display_name,line_picture_url),consultation_methods(code),booking_details(google_document_id,google_document_created_at)').order('created_at').order('id').range(offset,offset+499);
    if(error)return NextResponse.json({error:error.message},{status:500});
    bookings.push(...(data||[]));if((data||[]).length<500)break;
  }
  return NextResponse.json(buildRenameQueue(bookings),{headers:{'Cache-Control':'no-store'}});
}

