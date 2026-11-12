import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {adminSupabase} from '@/lib/supabase';
import {isAdminSession} from '@/lib/admin-session';
import {taipeiDateKey} from '@/lib/taipei-time';
import {resultReminderFields,defaultResultReminderRecipients,resultReminderDays,resultReminderEnd,resultReminderEligible,resultReminderText,resultReminderRetryKey} from '@/lib/result-reminders';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:NextRequest){
 const dryRun=request.nextUrl.searchParams.get('dryRun')==='1';
 const cronAuth=!!process.env.CRON_SECRET&&request.headers.get('authorization')===`Bearer ${process.env.CRON_SECRET}`;
 if(!cronAuth&&!(dryRun&&isAdminSession((await cookies()).get('admin_session')?.value)))return NextResponse.json({error:'未授權'},{status:401});
 try{
 const enabled=process.env.RESULT_REMINDERS_ENABLED==='true';
 if(!enabled&&!dryRun)return NextResponse.json({ok:true,enabled:false,reason:'尚未啟用，未發送'});
 const days=resultReminderDays(),now=new Date(),date=taipeiDateKey(now);
 const recipients=[...new Set((process.env.RESULT_REMINDER_RECIPIENT_IDS||defaultResultReminderRecipients.join(',')).split(',').map(value=>value.trim()).filter(Boolean))];
 if(!recipients.length||recipients.some(id=>!/^U[a-f0-9]{32}$/i.test(id)))throw Error('工作人員 LINE 接收名單格式錯誤');
 const db=adminSupabase();
 const {data,error}=await db.from('bookings').select(resultReminderFields).eq('consultation_methods.code','video').eq('payment_status','paid').gt('slot_start',now.toISOString()).lt('slot_start',resultReminderEnd(now,days).toISOString());
 if(error)throw Error('查詢訂單失敗，未發送');
 const bookings=(data||[]).filter((booking:any)=>resultReminderEligible(booking,now,days)).sort((a:any,b:any)=>Date.parse(a.slot_start)-Date.parse(b.slot_start));
 if(dryRun)return NextResponse.json({ok:true,dryRun:true,enabled,days,recipients,count:bookings.length,previews:bookings.map((b:any)=>({bookingNo:b.booking_no,text:resultReminderText(b)}))},{headers:{'Cache-Control':'no-store'}});
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)throw Error('尚未設定 LINE_MESSAGING_CHANNEL_ACCESS_TOKEN');
 let sent=0,skipped=0,failed=0;
 for(const booking of bookings)for(const recipient of recipients){
  const retryKey=resultReminderRetryKey(booking.id,date,recipient);
  const {data:claim,error:claimError}=await db.from('result_reminder_log').insert({booking_id:booking.id,reminder_date:date,recipient_line_user_id:recipient,retry_key:retryKey,status:'sending'}).select('id').single();
  if(claimError?.code==='23505'){skipped++;continue;}
  if(claimError||!claim)throw Error('提醒紀錄建立失敗，請確認已執行 056 SQL；停止後續發送');
  let outcome:'sent'|'skipped'|'failed'|'uncertain'='failed',lastError:string|null=null;
  try{
   const {data:fresh,error:freshError}=await db.from('bookings').select(resultReminderFields).eq('id',booking.id).single();
   if(freshError)throw Error('發送前重新確認訂單失敗');
   if(!fresh||!resultReminderEligible(fresh,new Date(),days)){outcome='skipped';skipped++;}
   else{
    const text=resultReminderText(fresh);
    // A timeout can mean LINE accepted the request. Keep the claim; do not blindly resend.
    outcome='uncertain';
    const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json','X-Line-Retry-Key':retryKey},body:JSON.stringify({to:recipient,messages:[{type:'text',text}]}),signal:AbortSignal.timeout(10000)});
    if(response.ok||(response.status===409&&response.headers.get('x-line-accepted-request-id'))){outcome='sent';sent++;}
    else{outcome='failed';throw Error(`LINE 通知未成功（HTTP ${response.status}）`);}
   }
  }catch(e){lastError=e instanceof Error?e.message:'通知失敗';failed++;}
  const {error:logError}=await db.from('result_reminder_log').update({status:outcome,last_error:lastError,sent_at:outcome==='sent'?new Date().toISOString():null}).eq('id',claim.id);
  if(logError)throw Error('發送結果寫入失敗，已停止後續發送；保留防重複紀錄，請人工核對');
 }
 return NextResponse.json({ok:failed===0,sent,skipped,failed},{status:failed?500:200});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'回傳提醒失敗'},{status:500});}
}
