import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { bookingStatusFlex, pushLineFlex } from "@/lib/line-message";

export async function POST(request: NextRequest) {
  const lineUid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!lineUid) return NextResponse.json({error:"LINE 登入已失效"},{status:401});
  const {bookingNo}=await request.json(),db=adminSupabase();
  const {data:booking}=await db.from("bookings").select("booking_no,total_price,expires_at,slot_start,customers(line_user_id),consultation_methods(code),booking_details(item_title,booking_detail_sub_items(sub_item_title))").eq("booking_no",bookingNo).single();
  const customer=booking?.customers as unknown as {line_user_id:string}|null;
  if(!booking||customer?.line_user_id!==lineUid)return NextResponse.json({error:"找不到訂單"},{status:404});
  const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
  const method=Array.isArray(booking.consultation_methods)?booking.consultation_methods[0]:booking.consultation_methods;
  const items=(booking.booking_details||[]).map((x:any)=>[x.item_title,...(x.booking_detail_sub_items||[]).map((s:any)=>s.sub_item_title)].filter(Boolean).join("｜"));
  await pushLineFlex(lineUid,"林阿嫂預約待付款",bookingStatusFlex({status:"pending",bookingNo:booking.booking_no,method:method?.code||"text",total:Number(booking.total_price),slotStart:booking.slot_start||undefined,items,expiresAt:booking.expires_at||undefined,site}));
  return NextResponse.json({ok:true});
}
