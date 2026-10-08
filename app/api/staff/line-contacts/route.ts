import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminSession } from '@/lib/admin-session';
import { adminSupabase } from '@/lib/supabase';
export async function POST(request:NextRequest) {
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 const token=process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
 if(!token)return NextResponse.json({error:'尚未設定 LINE 傳訊帳號'},{status:503});
 const body=await request.json(),params=new URLSearchParams({limit:'25'});
 if(body.cursor)params.set('start',String(body.cursor).slice(0,2000));
 const headers={Authorization:`Bearer ${token}`};
 const response=await fetch('https://api.line.me/v2/bot/followers/ids?'+params,{headers});
 if(!response.ok)return NextResponse.json({error:'LINE 尚未允許此官方帳號讀取好友名單（需認證或進階帳號）；目前可搜尋已註冊或已由收訊紀錄取得的聯絡人。'},{status:502});
 const page=await response.json(),db=adminSupabase();
 for(let i=0;i<(page.userIds||[]).length;i+=5){
  const profiles=await Promise.all(page.userIds.slice(i,i+5).map(async(id:string)=>{const r=await fetch('https://api.line.me/v2/bot/profile/'+encodeURIComponent(id),{headers});if(!r.ok)return null;const p=await r.json();return {line_user_id:id,display_name:p.displayName,picture_url:p.pictureUrl||null,updated_at:new Date().toISOString()};}));
  const valid=profiles.filter(Boolean);if(valid.length){const {error}=await db.from('line_contacts').upsert(valid);if(error)return NextResponse.json({error:'聯絡人目錄無法儲存，請先執行 055_line_contacts.sql。'},{status:500});}
 }
 return NextResponse.json({next:page.next||null});
}
export async function GET(request:NextRequest) {
 if(!isAdminSession((await cookies()).get('admin_session')?.value))return NextResponse.json({error:'未登入'},{status:401});
 const q=(request.nextUrl.searchParams.get('q')||'').trim().slice(0,80).toLocaleLowerCase();
 if(!q)return NextResponse.json({people:[]});
 const db=adminSupabase(),people=new Map<string,any>();let warning='';
 for(const table of ['line_contacts','customers']) {
  for(let offset=0;;offset+=500){
   const {data,error}=await db.from(table).select(table==='customers'?'line_user_id,line_display_name,line_picture_url,full_name':'line_user_id,display_name,picture_url').order('line_user_id').range(offset,offset+499);
   if(error){if(table==='customers')return NextResponse.json({error:error.message},{status:500});warning='LINE 聯絡人目錄尚未建立，暫時只搜尋已註冊用戶。請執行 055 SQL。';break;}
   for(const row of (data||[]) as any[]){
    const id=row.line_user_id,name=row.display_name||row.line_display_name||row.full_name||'';
    if(!/^U[0-9a-f]{32}$/i.test(id||''))continue;
    if(![name,row.full_name].filter(Boolean).some(v=>v.toLocaleLowerCase().includes(q)))continue;
    people.set(id,{line_user_id:id,display_name:name,full_name:row.full_name||'',picture_url:row.picture_url||row.line_picture_url||'',source:table==='customers'?'預約用戶':'LINE 聯絡人'});
   }
   if((data||[]).length<500)break;
  }
 }
 return NextResponse.json({people:[...people.values()].slice(0,50),warning},{headers:{'Cache-Control':'no-store'}});
}
