import {validReturnDraft} from '@/lib/consultation-return-draft';
import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {adminSupabase} from '@/lib/supabase';
import {bookingForConsultationReturn} from '@/lib/consultation-return-delivery';
export async function GET(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 try{const bookingNo=request.nextUrl.searchParams.get('bookingNo')||'',documentId=request.nextUrl.searchParams.get('documentId')||'';
 const {detail}=await bookingForConsultationReturn(bookingNo,documentId);if(!documentId||detail.google_document_id!==documentId)throw new Error('文件與訂單不符');
 const {data,error}=await adminSupabase().from('consultation_return_drafts').select('payload,revision,updated_at').eq('booking_no',bookingNo).eq('document_id',documentId).maybeSingle();
 if(error)throw new Error('草稿讀取失敗，請確認已執行050 SQL');return NextResponse.json({draft:data},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'草稿讀取失敗'},{status:400})}
}
export async function PUT(request:NextRequest){
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 try{const body=await request.json();
 if(!Number.isInteger(body.revision)||body.revision<0||!validReturnDraft(body.payload)||JSON.stringify(body.payload).length>1000000)throw new Error('草稿格式或大小不正確');
 const {detail}=await bookingForConsultationReturn(String(body.bookingNo||''),String(body.documentId||''));if(!body.documentId||detail.google_document_id!==body.documentId)throw new Error('文件與訂單不符');
 const {data,error}=await adminSupabase().rpc('save_consultation_return_draft',{p_booking_no:body.bookingNo,p_document_id:body.documentId,p_payload:body.payload,p_revision:body.revision});
 if(error)throw new Error('草稿儲存失敗，請確認已執行050 SQL');
 if(!data?.length)return NextResponse.json({error:'另一個頁面已更新草稿。本頁修改仍保留，請先複製內容，再重新整理確認最新版本。'},{status:409});
 return NextResponse.json({ok:true,...data[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'草稿儲存失敗'},{status:400})}
}
