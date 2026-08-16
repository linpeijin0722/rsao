import { adminSupabase } from "@/lib/supabase";
import { bookingFlex, pushLineFlex } from "@/lib/line-message";

export async function confirmPayment(fields: Record<string, string>, site: string) {
  if (fields.RtnCode !== "1") return "";
  const { bookingNoFromTradeNo } = await import("@/lib/ecpay");
  const bookingNo = bookingNoFromTradeNo(fields.MerchantTradeNo || "");
  if (!bookingNo) return "";
  const db = adminSupabase();
  await db.from("bookings").update({
    payment_status: "paid",
    payment_method: String(fields.PaymentType || "").toLowerCase().includes("linepay") ? "line_pay" : String(fields.PaymentType || "").toLowerCase().includes("credit") ? "credit_card" : "transfer",
    status: "confirmed",
    paid_at: new Date().toISOString(),
  }).eq("booking_no", bookingNo).in("status", ["pending_payment", "confirmed"]);
  const { data: booking } = await db.from("bookings").select("booking_no,total_price,slot_start,slot_end,payment_status,payment_notified_at,customers(line_user_id),consultation_methods(code)").eq("booking_no", bookingNo).single();
  if (booking?.payment_status === "paid" && !booking.payment_notified_at) {
    const customer = booking.customers as unknown as { line_user_id: string };
    const method = booking.consultation_methods as unknown as { code: string };
    const stamp = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const slot = booking.slot_start && booking.slot_end ? `${stamp(booking.slot_start)}/${stamp(booking.slot_end)}` : undefined;
    try {
      await pushLineFlex(customer.line_user_id, "已付款｜請填寫問事資料", bookingFlex({ bookingNo, total: booking.total_price, method: method.code, slot, site }));
      await db.from("bookings").update({ payment_notified_at: new Date().toISOString() }).eq("booking_no", bookingNo);
    } catch (error) {
      console.error("付款已入帳，但 LINE 通知失敗", error);
    }
  }
  return bookingNo;
}
