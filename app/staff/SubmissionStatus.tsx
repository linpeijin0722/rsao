"use client";
export default function SubmissionStatus({ booking, onView, onMissing }: {
  booking: any; onView: (booking: any) => void; onMissing: (booking: any) => void;
}) {
  if (booking.payment_status !== "paid") return <span>—</span>;
  return booking.data_submitted_at
    ? <button className="returned" onClick={() => onView(booking)}>{booking.data_submission_source === "manual_line" ? "已手動回傳" : "已回傳"}</button>
    : <button className="missing" onClick={() => onMissing(booking)}>尚未回傳</button>;
}
