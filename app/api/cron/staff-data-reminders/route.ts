import {NextRequest,NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {adminSupabase} from '@/lib/supabase';
import {isAdminSession} from '@/lib/admin-session';
import {taipeiDateKey} from '@/lib/taipei-time';
import {reminderEligible,isReminderNoon,staffReminderText} from '@/lib/staff-data-reminders';
export async function GET(request:NextRequest){
 const dryRun=request.nextUrl.searchParams.get('dryRun')==='1';
 const authorized=!!process.env.CRON_SECRET&&request.headers.get('authorization')===`Bearer ${process.env.CRON_SECRET}`;
 if(!authorized&&!(dryRun&&isAdminSession((await cookies()).get('admin_session')?.value)))return NextResponse.json({error:'未授權'},{status:401});
 const now=new Date();if(!dryRun&&!isReminderNoon(now))return NextResponse.json({ok:true,skipped:'尚未到台灣中午12點'});
 try{
 const db=adminSupabase();const {data:settings,error:settingsError}=await db.from('staff_data_reminder_settings').select('*').eq('id',true).single();
 if(settingsError)throw new Error('客服提醒設定尚未建立，請執行047 SQL');
 if(!settings?.enabled||!settings.recipient_line_user_id)return NextResponse.json({ok:true,dryRun,enabled:false,reason:'未唯一確認客服身分，尚未啟用'});
 const {data:people,error:peopleError}=await db.from('customers').select('full_name,line_display_name,line_user_id').eq('line_user_id',settings.recipient_line_user_id);
 if(peopleError)throw new Error('客服身分查詢失敗');
 if(!people?.length||people.some(p=>p.full_name?.trim()!==settings.expected_full_name||p.line_display_name?.trim()!==settings.expected_line_name))throw new Error('客服身分與設定不符，已停止發送');
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;if(!token)throw new Error('尚未設定LINE_MESSAGING_CHANNEL_ACCESS_TOKEN');
 const profileResponse=await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(settings.recipient_line_user_id)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 if(!profileResponse.ok)throw new Error('無法向LINE確認客服身分，已停止發送');
 const profile=await profileResponse.json();if(profile.displayName?.trim()!==settings.expected_line_name)throw new Error('LINE名稱不符，已停止發送');
 const fields='id,booking_no,slot_start,status,payment_status,expires_at,data_submitted_at,customers(full_name,line_display_name),consultation_methods!inner(code)';
 const {data:rows,error}=await db.from('bookings').select(fields).eq('consultation_methods.code','video').is('data_submitted_at',null).gt('slot_start',now.toISOString());
 if(error)throw new Error('預約查詢失敗');const bookings=(rows||[]).filter(b=>reminderEligible(b,now));
 const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
 if(dryRun)return NextResponse.json({ok:true,dryRun:true,recipient:{fullName:settings.expected_full_name,lineName:profile.displayName},count:bookings.length,previews:bookings.map(b=>staffReminderText(b,site))});
 let sent=0,skipped=0,failed=0;
 for(const booking of bookings){
 const {data:claim,error:claimError}=await db.from('staff_data_reminder_log').insert({booking_id:booking.id,reminder_date:taipeiDateKey(now),recipient_line_user_id:settings.recipient_line_user_id}).select('id').single();
 if(claimError){if(claimError.code==='23505'){skipped++;continue;}throw new Error('提醒記錄建立失敗，已停止發送');}
 try{
 const {data:fresh,error:freshError}=await db.from('bookings').select(fields).eq('id',booking.id).single();
 if(freshError)throw new Error('重新確認預約失敗');
 if(!fresh||!reminderEligible(fresh,new Date())){await db.from('staff_data_reminder_log').update({status:'skipped'}).eq('id',claim.id);skipped++;continue;}
 const response=await fetch('https://api.line.me/v2/bot/message/push',{method:'POST',headers:{Authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({to:settings.recipient_line_user_id,messages:[{type:'text',text:staffReminderText(fresh,site)}]})});
 if(!response.ok)throw new Error(`LINE通知失敗（${response.status}）`);
 const {error:logError}=await db.from('staff_data_reminder_log').update({status:'sent',sent_at:new Date().toISOString()}).eq('id',claim.id);
 if(logError)throw new Error('通知已送出，但更新記錄失敗');sent++;
 }catch(e){failed++;await db.from('staff_data_reminder_log').update({status:'failed',last_error:e instanceof Error?e.message:'通知失敗'}).eq('id',claim.id);}
 }
 return NextResponse.json({ok:failed===0,sent,skipped,failed});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'客服提醒失敗'},{status:500});}
}
