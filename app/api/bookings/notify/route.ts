import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex } from "@/lib/line-message";

export async function POST(request: NextRequest) {
  const lineUid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!lineUid) return NextResponse.json({error:"LINE 登入已失效"},{status:401});
  const {bookingNo}=await request.json(),db=adminSupabase();
  const {data:booking}=await db.from("bookings").select("booking_no,total_price,expires_at,customers(line_user_id),booking_details(item_title)").eq("booking_no",bookingNo).single();
  const customer=booking?.customers as unknown as {line_user_id:string}|null;
  if(!booking||customer?.line_user_id!==lineUid)return NextResponse.json({error:"找不到訂單"},{status:404});
  const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
  const deadline=new Date(booking.expires_at||Date.now()+86400000).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"});
  await pushLineFlex(lineUid,"林阿嫂預約待付款",{type:"bubble",header:{type:"box",layout:"vertical",backgroundColor:"#F7F7F7",contents:[{type:"text",text:"待付款",color:"#E64B45",weight:"bold",size:"xl",align:"center"},{type:"text",text:"林阿嫂線上諮詢",color:"#999999",align:"center",margin:"sm"}]},body:{type:"box",layout:"vertical",spacing:"md",contents:[{type:"text",text:`訂單編號：${booking.booking_no}`,weight:"bold",wrap:true},{type:"text",text:(booking.booking_details||[]).map((x:any)=>x.item_title).join("、"),wrap:true},{type:"text",text:`金額：NT$ ${Number(booking.total_price).toLocaleString("zh-TW")}`,color:"#E64B45",weight:"bold"},{type:"text",text:`請於 ${deadline} 前完成付款，超過24小時將自動失效。`,wrap:true,color:"#555555"}]},footer:{type:"box",layout:"vertical",contents:[{type:"box",layout:"vertical",paddingAll:"14px",backgroundColor:"#8A3045",cornerRadius:"8px",action:{type:"uri",uri:`${site}/pay?order=${encodeURIComponent(booking.booking_no)}`},contents:[{type:"text",text:"繼續付款",size:"lg",weight:"bold",align:"center",color:"#FFFFFF"}]}]}});
  return NextResponse.json({ok:true});
}
