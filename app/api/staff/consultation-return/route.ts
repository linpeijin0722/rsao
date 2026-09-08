import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { getConsultationReturnPreview, normalizeConsultationReturnText } from "@/lib/google-consultation-docs";
import { pushLineText } from "@/lib/line-message";

const one = (value: any) => Array.isArray(value) ? value[0] : value;

async function bookingForDocument(bookingNo: string, requestedDocumentId: string) {
  const db = adminSupabase();
  const { data: booking, error } = await db.from("bookings").select(
    "id,booking_no,customers(line_user_id,line_display_name,line_picture_url,full_name),booking_details(id,item_title,google_document_id,google_document_url)",
  ).eq("booking_no", bookingNo).single();
  if (error || !booking) throw new Error(error?.message || "找不到訂單");
  const details = Array.isArray(booking.booking_details) ? booking.booking_details : [];
  const documents = details.filter((detail: any) => detail.google_document_id);
  const detail = requestedDocumentId
    ? documents.find((entry: any) => entry.google_document_id === requestedDocumentId)
    : documents[0];
  if (!detail) throw new Error("找不到這筆訂單的 Google 諮詢單");
  return { booking, detail, customer: one(booking.customers) };
}

export async function GET(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const bookingNo = request.nextUrl.searchParams.get("bookingNo") || "";
    const documentId = request.nextUrl.searchParams.get("documentId") || "";
    if (!bookingNo) return NextResponse.json({ error: "缺少訂單編號" }, { status: 400 });
    const { booking, detail, customer } = await bookingForDocument(bookingNo, documentId);
    const items = await getConsultationReturnPreview(detail.google_document_id);
    return NextResponse.json({
      ok: true,
      bookingNo: booking.booking_no,
      customerName: customer?.full_name || customer?.line_display_name || "LINE 用戶",
      lineDisplayName: customer?.line_display_name || "",
      linePictureUrl: customer?.line_picture_url || "",
      documentId: detail.google_document_id,
      documentUrl: detail.google_document_url || `https://docs.google.com/document/d/${detail.google_document_id}/edit`,
      items,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "讀取諮詢結果失敗" }, { status: 400 });
  }
}

function splitLineText(value: string, limit = 4500) {
  const chars = Array.from(value.trim());
  const chunks: string[] = [];
  while (chars.length) {
    let take = Math.min(limit, chars.length);
    if (chars.length > limit) {
      const probe = chars.slice(0, take).join("");
      const lastBreak = Math.max(probe.lastIndexOf("\n"), probe.lastIndexOf("。"));
      if (lastBreak > Math.floor(limit * 0.6)) take = Array.from(probe.slice(0, lastBreak + 1)).length;
    }
    chunks.push(chars.splice(0, take).join("").trim());
  }
  return chunks.filter(Boolean);
}

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  try {
    const body = await request.json();
    const bookingNo = String(body.bookingNo || "");
    const documentId = String(body.documentId || "");
    const selected = Array.isArray(body.selectedIndexes)
      ? [...new Set(body.selectedIndexes.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0))]
      : [];
    const editedItems = body.editedItems && typeof body.editedItems === "object" ? body.editedItems as Record<string, unknown> : {};
    if (!bookingNo || !selected.length) return NextResponse.json({ error: "請至少選擇一個要回傳的項目" }, { status: 400 });
    const { detail, customer } = await bookingForDocument(bookingNo, documentId);
    if (!customer?.line_user_id) return NextResponse.json({ error: "這位用戶沒有 LINE UID，無法回傳" }, { status: 400 });

    // 送出前重新讀一次 Google 文件，避免預覽後老師又修改內容而送出舊版本。
    const freshItems = await getConsultationReturnPreview(detail.google_document_id);
    const selectedItems = freshItems.filter((item) => selected.includes(item.index)).map((item) => ({
      ...item,
      content: normalizeConsultationReturnText(
        Object.prototype.hasOwnProperty.call(editedItems, String(item.index))
          ? String(editedItems[String(item.index)] || "")
          : item.content,
      ),
    }));
    if (!selectedItems.length) return NextResponse.json({ error: "找不到選取的諮詢結果" }, { status: 400 });

    let messageCount = 0;
    for (const item of selectedItems) {
      const chunks = splitLineText(item.content);
      if (!chunks.length) throw new Error(`項目 ${item.index} 沒有可回傳的內容`);
      for (const chunk of chunks) {
        await pushLineText(customer.line_user_id, chunk);
        messageCount += 1;
      }
    }
    return NextResponse.json({ ok: true, sentItems: selectedItems.length, messageCount });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LINE 回傳失敗" }, { status: 400 });
  }
}
