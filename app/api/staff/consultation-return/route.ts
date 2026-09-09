import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { getConsultationReturnPreview } from "@/lib/google-consultation-docs";
import { bookingForConsultationReturn, deliverPreparedConsultationReturn, prepareConsultationReturn } from "@/lib/consultation-return-delivery";

export async function GET(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value)) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const bookingNo = request.nextUrl.searchParams.get("bookingNo") || "";
    const documentId = request.nextUrl.searchParams.get("documentId") || "";
    if (!bookingNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
    const { booking, detail, customer } = await bookingForConsultationReturn(bookingNo, documentId);
    // 開啟頁面只讀取資料，不可重寫按鈕或「上次回傳時間」。
    const items = await getConsultationReturnPreview(detail.google_document_id);
    return NextResponse.json({
      ok: true, bookingNo: booking.booking_no,
      customerName: customer?.full_name || customer?.line_display_name || "LINE 用戶",
      lineDisplayName: customer?.line_display_name || "", linePictureUrl: customer?.line_picture_url || "",
      documentId: detail.google_document_id,
      documentUrl: detail.google_document_url || `https://docs.google.com/document/d/${detail.google_document_id}/edit`,
      returnedAt: booking.consultation_result_returned_at || null, items,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取諮詢結果失敗" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value)) return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const body = await request.json();
    const mode = body.mode === "scheduled" ? "scheduled" : "immediate";
    const prepared = await prepareConsultationReturn({
      bookingNo: String(body.bookingNo || ""), documentId: String(body.documentId || ""),
      selectedIndexes: body.selectedIndexes, editedItems: body.editedItems, skipCarousel: body.skipCarousel === true,
    });
    if (mode === "scheduled") {
      const scheduledFor = new Date(String(body.scheduledAt || ""));
      if (!Number.isFinite(scheduledFor.getTime())) return NextResponse.json({ error: "請選擇正確的排程日期與時間" }, { status: 400 });
      if (![0, 30].includes(scheduledFor.getUTCMinutes()) || scheduledFor.getUTCSeconds() !== 0)
        return NextResponse.json({ error: "排程時間只能選擇整點或半點（00／30 分）" }, { status: 400 });
      if (scheduledFor.getTime() <= Date.now() + 30_000) return NextResponse.json({ error: "排程時間必須晚於現在，請重新選擇" }, { status: 400 });
      const { data: schedule, error } = await adminSupabase().from("consultation_return_schedules").insert({
        booking_no: prepared.bookingNo, document_id: prepared.documentId,
        scheduled_for: scheduledFor.toISOString(), payload: prepared,
      }).select("id,scheduled_for").single();
      if (error) throw new Error(error.message.includes("consultation_return_schedules") ? "尚未建立排程資料表，請先執行本次提供的 Supabase SQL" : error.message);
      return NextResponse.json({ ok: true, scheduled: true, scheduleId: schedule.id, scheduledAt: schedule.scheduled_for });
    }
    const site = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const result = await deliverPreparedConsultationReturn(prepared, site);
    return NextResponse.json({ ok: true, sentItems: prepared.items.length, messageCount: result.messageCount, skippedCarousel: prepared.skipCarousel, returnedAt: result.returnedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LINE 回傳失敗" }, { status: 400 });
  }
}
