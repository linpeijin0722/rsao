import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex, videoReminderFlex } from "@/lib/line-message";

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { lineUserId, message, action, bookingNo } = await request.json();
  if (!lineUserId) return NextResponse.json({ error: "缺少 LINE 用戶" }, { status: 400 });
  if (action === "video_reminder") {
    if (!bookingNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
    const { data: booking, error } = await adminSupabase().from("bookings").select("booking_no,slot_start,payment_status,status,customers(line_user_id),consultation_methods(code)").eq("booking_no", bookingNo).single();
    if (error || !booking) return NextResponse.json({ error: error?.message || "找不到訂單" }, { status: 404 });
    const customer = booking.customers as unknown as { line_user_id: string } | null;
    const method = booking.consultation_methods as unknown as { code: string } | null;
    if (booking.payment_status !== "paid") return NextResponse.json({ error: "只有已付款訂單可以傳送視訊提醒" }, { status: 400 });
    if (booking.status === "cancelled" || method?.code !== "video" || !booking.slot_start) return NextResponse.json({ error: "這不是有效的視訊預約" }, { status: 400 });
    if (!customer?.line_user_id || customer.line_user_id !== lineUserId) return NextResponse.json({ error: "訂單與 LINE 用戶不符" }, { status: 400 });
    try {
      await pushLineFlex(lineUserId, "視訊諮詢提醒", videoReminderFlex({ bookingNo: booking.booking_no, slotStart: booking.slot_start, site: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin }));
      return NextResponse.json({ ok: true });
    } catch (sendError) {
      return NextResponse.json({ error: sendError instanceof Error ? sendError.message : "LINE 傳送失敗" }, { status: 502 });
    }
  }
  if (!String(message || "").trim()) return NextResponse.json({ error: "缺少訊息內容" }, { status: 400 });
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "尚未設定 LINE 訊息金鑰" }, { status: 500 });
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: String(message).trim() }] }),
  });
  if (!response.ok) return NextResponse.json({ error: `LINE 傳送失敗：${await response.text()}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
