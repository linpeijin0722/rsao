import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {isAdminSession} from '@/lib/admin-session';
import {isQuickReplyToken} from '@/lib/quick-reply-token';
import {adminSupabase} from '@/lib/supabase';
async function authorized(bookingNo:string,documentId:string,token:string){return !!bookingNo&&!!documentId&&(isAdminSession((await cookies()).get('admin_session')?.value)||isQuickReplyToken(token,bookingNo,documentId));}
export async function GET(request:NextRequest){
 const p=request.nextUrl.searchParams,b=p.get('bookingNo')||'',d=p.get('documentId')||'',scope=p.get('scope')||'';
 if(!await authorized(b,d,p.get('accessToken')||''))return NextResponse.json({error:'連結驗證失敗，請從原諮詢單重新開啟'},{status:401});
 const {data,error}=await adminSupabase().from('consultation_writing_drafts').select('payload,revision,updated_at').eq('booking_no',b).eq('document_id',d).eq('scope',scope).maybeSingle();
 return error?NextResponse.json({error:'草稿讀取失敗，請確認已建立草稿資料表'},{status:500}):NextResponse.json({draft:data},{headers:{'Cache-Control':'no-store'}});
}
export async function PUT(request:NextRequest){
 try{
 const body=await request.json();
 if(!await authorized(body.bookingNo,body.documentId,body.accessToken))return NextResponse.json({error:'連結驗證失敗，草稿尚未儲存'},{status:401});
 if(!Number.isInteger(body.revision)||body.revision<0||!body.payload||body.payload.version!==1||JSON.stringify(body.payload).length>1500000)return NextResponse.json({error:'草稿格式不正確或內容過大'},{status:400});
 const {data,error}=await adminSupabase().rpc('save_consultation_writing_draft',{p_booking_no:body.bookingNo,p_document_id:body.documentId,p_scope:String(body.scope||''),p_revision:body.revision,p_payload:body.payload});
 if(error)throw Error('草稿儲存失敗，請稍後重試');
 if(!data?.length)return NextResponse.json({error:'另一個裝置已更新此單。本頁內容仍保留；請先複製回答，再重新開啟比對。'},{status:409});
 return NextResponse.json({ok:true,...data[0]});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'草稿儲存失敗'},{status:500});}
}
