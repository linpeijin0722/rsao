import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
export const dynamic = "force-dynamic";
const token=()=>process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN||"";
async function push(to:string,text:string){const response=await fetch("https://api.line.me/v2/bot/message/push",{method:"POST",headers:{Authorization:`Bearer ${token()}`,"content-type":"application/json"},body:JSON.stringify({to,messages:[{type:"text",text}]})});if(!response.ok)throw Error(await response.text());}
async function profile(id:string){const response=await fetch(`https://api.line.me/v2/bot/profile/${id}`,{headers:{Authorization:`Bearer ${token()}`}});return response.ok?await response.json():null;}
export async function POST(request:NextRequest){
  const raw=await request.text(),secret=process.env.LINE_CHANNEL_SECRET||"",signature=request.headers.get("x-line-signature")||"";
  const expected=secret?crypto.createHmac("sha256",secret).update(Buffer.from(raw)).digest("base64"):"";
  if(!secret||!signature||signature.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return NextResponse.json({error:"invalid signature"},{status:401});
  if(!token())return NextResponse.json({ok:true});
  let body:any;try{body=JSON.parse(raw)}catch{return NextResponse.json({error:"invalid json"},{status:400})}
  for(const event of body.events||[]){const id=event.source?.userId;if(event.type!=="message"||!id)continue;const contact=await profile(id);if(contact?.displayName){await adminSupabase().from("line_contacts").upsert({line_user_id:id,display_name:contact.displayName,picture_url:contact.pictureUrl||null,updated_at:new Date().toISOString()});}const {data:watch}=await adminSupabase().from("line_watchlist").select("display_name,note").eq("line_user_id",id).eq("enabled",true).maybeSingle();if(!watch)continue;const p=contact;const text=event.message?.type==="text"?String(event.message.text):`（${event.message?.type||"非文字"}訊息）`;const {data:recipients}=await adminSupabase().from("customers").select("line_user_id").eq("full_name","林珮均").ilike("line_display_name","%Peggy%");const peggy=recipients?.length===1?recipients[0].line_user_id:process.env.LINE_PEGGY_USER_ID||"";if(!peggy)continue;await push(peggy,`🚨合作邀約／重點聯繫提醒\n對方：${watch.display_name||p?.displayName||"未命名"}\n訊息：${text}\nLINE User ID：${id}`)}
  return NextResponse.json({ok:true});
}
export async function GET(){return NextResponse.json({ok:true});}
