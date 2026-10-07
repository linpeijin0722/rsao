import { parseTaipeiDateTime, taipeiDateKey } from "./taipei-time";

const DAY = 86400000;
export type PendingKind = "video" | "text" | "result";
export type PendingEntry = { booking: any; kind: PendingKind; dueAt: number };
const instant = (value: unknown) => value ? parseTaipeiDateTime(String(value)).getTime() : NaN;
export function resultReturnedAt(booking: any): string | null {
  return booking.consultation_result_returned_at || booking.consultation_result_manual_at || booking.consultation_result_detected_at || null;
}
export function isStaffTestBooking(booking: any): boolean {
  const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers;
  const name = String(customer?.full_name || "").trim(), line = String(customer?.line_display_name || "").trim().toLowerCase();
  return (name === "林珮均" && line === "peggy") || (name === "林啟恩" && line === "nnn");
}
export function pendingBookings(bookings: any[], now = Date.now()): PendingEntry[] {
  const entries: PendingEntry[] = [];
  for (const booking of bookings) {
    if (isStaffTestBooking(booking) || resultReturnedAt(booking)) continue;
    if (booking.payment_status !== "paid" || ["cancelled", "canceled", "expired", "refunded"].includes(booking.status)) continue;
    let dueAt = NaN;
    let kind: PendingKind;
    if (booking.data_submitted_at) {
      if (resultReturnedAt(booking)) continue;
      kind = "result";
      dueAt = instant(booking.data_submitted_at) + 14 * DAY;
    } else {
      const method = Array.isArray(booking.consultation_methods) ? booking.consultation_methods[0] : booking.consultation_methods;
      if (method?.code === "video") {
        kind = "video";
        if (Number.isFinite(instant(booking.slot_start))) dueAt = instant(taipeiDateKey(booking.slot_start)) - 7 * DAY;
      } else if (method?.code === "text") {
        kind = "text";
        if (Number.isFinite(instant(booking.paid_at))) dueAt = instant(taipeiDateKey(booking.paid_at)) + DAY + 12 * 3600000;
      } else continue;
    }
    if (Number.isFinite(dueAt) && now >= dueAt) entries.push({ booking, kind, dueAt });
  }
  return entries.sort((a, b) => a.dueAt - b.dueAt || String(a.booking.id).localeCompare(String(b.booking.id)));
}

/** Only the current documents count; historical versions cannot complete a new one. */
export function currentDocumentIds(booking: any): string[] {
  return [...new Set<string>((booking.booking_details || []).map((detail: any) =>
    String(detail.google_document_id || String(detail.google_document_url || "").match(/\/document\/d\/([\w-]+)/)?.[1] || ""),
  ).filter(Boolean))];
}
