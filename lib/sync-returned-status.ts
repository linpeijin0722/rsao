import { currentDocumentIds, resultReturnedAt } from "./staff-pending";

/** Persist the first observation, without confusing it with a LINE delivery time. */
export async function syncReturnedStatus(db: any, bookings: any[], listIds: () => Promise<Set<string>>, now = new Date().toISOString()) {
  const candidates = bookings.filter(booking => booking.payment_status === "paid" && booking.data_submitted_at &&
    !["cancelled", "canceled", "expired", "refunded"].includes(booking.status) && !resultReturnedAt(booking) && currentDocumentIds(booking).length);
  if (!candidates.length) return;
  const ids = await listIds();
  for (const booking of candidates) {
    if (!currentDocumentIds(booking).every(id => ids.has(id))) continue;
    const { data, error } = await db.from("bookings").update({ consultation_result_detected_at: now })
      .eq("id", booking.id).is("consultation_result_detected_at", null).is("consultation_result_returned_at", null)
      .select("consultation_result_detected_at").maybeSingle();
    if (error) throw new Error(error.message);
    if (data) booking.consultation_result_detected_at = data.consultation_result_detected_at;
  }
}
