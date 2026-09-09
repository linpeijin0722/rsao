import { adminSupabase } from "@/lib/supabase";
import {
  getConsultationReturnPreview,
  markConsultationResultReturned,
  moveConsultationDocumentToReturnedFolder,
  normalizeConsultationReturnText,
} from "@/lib/google-consultation-docs";
import { pushConsultationResultCarousel, pushLineText } from "@/lib/line-message";

const one = (value: any) => Array.isArray(value) ? value[0] : value;

export type PreparedConsultationReturn = {
  bookingNo: string;
  documentId: string;
  lineUserId: string;
  method: string;
  skipCarousel: boolean;
  items: Array<{ index: number; itemTitle: string; content: string }>;
};

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

export async function bookingForConsultationReturn(bookingNo: string, requestedDocumentId: string) {
  const db = adminSupabase();
  const { data: booking, error } = await db.from("bookings").select(
    "id,booking_no,consultation_result_returned_at,customers(line_user_id,line_display_name,line_picture_url,full_name),consultation_methods(code),booking_details(id,item_title,google_document_id,google_document_url)",
  ).eq("booking_no", bookingNo).single();
  if (error || !booking) throw new Error(error?.message || "找不到訂單");
  const details = Array.isArray(booking.booking_details) ? booking.booking_details : [];
  const documents = details.map((detail: any) => {
    const urlId = String(detail.google_document_url || "").match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] || "";
    return { ...detail, google_document_id: detail.google_document_id || urlId };
  }).filter((detail: any) => detail.google_document_id);
  const detail = requestedDocumentId
    ? documents.find((entry: any) => entry.google_document_id === requestedDocumentId) || documents[0]
    : documents[0];
  if (!detail) throw new Error("找不到這筆訂單的 Google 諮詢單");
  return { booking, detail, customer: one(booking.customers), method: one(booking.consultation_methods) };
}

export async function prepareConsultationReturn(args: {
  bookingNo: string;
  documentId: string;
  selectedIndexes: unknown;
  editedItems: unknown;
  skipCarousel: boolean;
}) {
  const selected = Array.isArray(args.selectedIndexes)
    ? [...new Set(args.selectedIndexes.map((value: unknown) => Number(value)).filter((value: number) => Number.isInteger(value) && value > 0))]
    : [];
  if (!args.bookingNo || !selected.length) throw new Error("請至少選擇一個要回傳的項目");
  const editedItems = args.editedItems && typeof args.editedItems === "object" ? args.editedItems as Record<string, unknown> : {};
  const { detail, customer, method } = await bookingForConsultationReturn(args.bookingNo, args.documentId);
  if (!customer?.line_user_id) throw new Error("這位用戶沒有 LINE UID，無法回傳");
  const freshItems = await getConsultationReturnPreview(detail.google_document_id);
  const items = freshItems.filter((item) => selected.includes(item.index)).map((item) => ({
    ...item,
    content: normalizeConsultationReturnText(
      Object.prototype.hasOwnProperty.call(editedItems, String(item.index))
        ? String(editedItems[String(item.index)] || "")
        : item.content,
    ),
  }));
  if (!items.length) throw new Error("找不到選取的諮詢結果");
  return {
    bookingNo: args.bookingNo,
    documentId: detail.google_document_id,
    lineUserId: customer.line_user_id,
    method: method?.code || "text",
    skipCarousel: args.skipCarousel,
    items,
  } satisfies PreparedConsultationReturn;
}

export async function deliverPreparedConsultationReturn(payload: PreparedConsultationReturn, site: string) {
  let messageCount = 0;
  for (const item of payload.items) {
    const chunks = splitLineText(item.content);
    if (!chunks.length) throw new Error(`項目 ${item.index} 沒有可回傳的內容`);
    for (const chunk of chunks) {
      await pushLineText(payload.lineUserId, chunk);
      messageCount += 1;
    }
  }
  if (!payload.skipCarousel) {
    await pushConsultationResultCarousel({
      userId: payload.lineUserId,
      method: payload.method,
      bookingNo: payload.bookingNo,
      site,
    });
  }
  const returnedAt = new Date().toISOString();
  const { error } = await adminSupabase().from("bookings")
    .update({ consultation_result_returned_at: returnedAt })
    .eq("booking_no", payload.bookingNo);
  if (error) throw error;
  try { await markConsultationResultReturned(payload.documentId, site, returnedAt, payload.bookingNo); }
  catch (markError) { console.error("更新 Google 諮詢單回傳狀態失敗", markError); }
  try { await moveConsultationDocumentToReturnedFolder(payload.documentId); }
  catch (moveError) { console.error("移動 Google 諮詢單到已回傳資料夾失敗", moveError); }
  return { returnedAt, messageCount };
}
