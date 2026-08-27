import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex, videoReminderFlex } from "@/lib/line-message";

export const dynamic = "force-dynamic";

function tomorrowInTaipeiRange(now = new Date()) {
  const taipei = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const year = taipei.getUTCFullYear();
  const month = taipei.getUTCMonth();
  const day = taipei.getUTCDate();
  const start = new Date(Date.UTC(year, month, day + 1) - 8 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year, month, day + 2) - 8 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const db = adminSupabase();
  const { start, end } = tomorrowInTaipeiRange();
  const { data: bookings, error } = await db
    .from("bookings")
    .select("booking_no,slot_start,payment_status,status,customers(line_user_id),consultation_methods(code)")
    .eq("payment_status", "paid")
    .eq("consultation_methods.code", "video")
    .is("video_reminder_sent_at", null)
    .gte("slot_start", start)
    .lt("slot_start", end)
    .neq("status", "cancelled");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  let sent = 0;
  const failed: string[] = [];

  for (const booking of bookings || []) {
    const customer = booking.customers as unknown as { line_user_id: string } | null;
    const method = booking.consultation_methods as unknown as { code: string } | null;
    if (!customer?.line_user_id || method?.code !== "video" || !booking.slot_start) continue;
    try {
      await pushLineFlex(
        customer.line_user_id,
        "明日視訊諮詢提醒",
        videoReminderFlex({ bookingNo: booking.booking_no, slotStart: booking.slot_start, site, isTomorrow: true }),
      );
      await db
        .from("bookings")
        .update({ video_reminder_sent_at: new Date().toISOString() })
        .eq("booking_no", booking.booking_no)
        .is("video_reminder_sent_at", null);
      sent += 1;
    } catch (sendError) {
      console.error("視訊預約提醒發送失敗", booking.booking_no, sendError);
      failed.push(booking.booking_no);
    }
  }

  return NextResponse.json({ ok: true, range: { start, end }, sent, failed });
}
