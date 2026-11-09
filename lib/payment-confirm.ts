import { adminSupabase } from "@/lib/supabase";
import { syncBookingCalendar } from "@/lib/google-calendar";
import { sendPaidBookingNotification } from "@/lib/payment-notification";

export async function confirmPayment(fields: Record<string, string>, site: string) {
  if (fields.RtnCode !== "1") return "";
  const { bookingNoFromTradeNo } = await import("@/lib/ecpay");
  const bookingNo = bookingNoFromTradeNo(fields.MerchantTradeNo || "");
  if (!bookingNo) return "";
  return confirmBookingPayment(
    bookingNo,
    String(fields.PaymentType || "").toLowerCase().includes("linepay") ? "line_pay" : String(fields.PaymentType || "").toLowerCase().includes("credit") ? "credit_card" : "transfer",
    site,
  );
}

export async function confirmNewebPayment(bookingNo: string, paymentType: string, site: string, tradeNo = "", amount?: number) {
  if (!bookingNo) return "";
  const normalized=paymentType.toUpperCase();
  // 固定帳戶與藍新的銀行轉帳類型必須由後台人工核帳；其他藍新付款成功後自動入帳。
  if (["VACC","WEBATM"].some(code=>normalized.includes(code))) return "";
  const confirmedMethod=normalized.includes("LINEPAY")?"line_pay":normalized.includes("CREDIT")?"credit_card":"other";
  return confirmBookingPayment(
    bookingNo,
    confirmedMethod,
    site,
    {provider:"newebpay",providerType:paymentType,tradeNo,amount},
  );
}

async function confirmBookingPayment(bookingNo: string, paymentMethod: string, site: string,provider?:{provider:string;providerType:string;tradeNo:string;amount?:number}) {
  const db = adminSupabase();
  const {data:current,error:currentError}=await db.from("bookings").select("payment_status,total_price,status").eq("booking_no",bookingNo).single();
  if(currentError||!current)throw new Error(currentError?.message||"找不到付款訂單");
  if(provider?.amount!==undefined&&Number(current.total_price)!==Number(provider.amount))throw new Error("藍新付款金額與訂單金額不符");
  if(current.payment_status==="paid"){
    await sendPaidBookingNotification(bookingNo,site);
    return bookingNo;
  }
  const {data:updated,error:updateError}=await db.from("bookings").update({
    payment_status: "paid",
    payment_method: paymentMethod,
    status: "confirmed",
    paid_at: new Date().toISOString(),
    collection_source:provider?.provider||"gateway",
    payment_provider:provider?.provider||"gateway",
    payment_provider_type:provider?.providerType||paymentMethod,
    payment_provider_trade_no:provider?.tradeNo||null,
    payment_notification_status:"pending",
    payment_notification_error:null,
    payment_notification_next_retry_at:new Date().toISOString(),
  }).eq("booking_no", bookingNo).neq("payment_status","paid").in("status", ["pending_payment", "confirmed"]).select("booking_no").maybeSingle();
  if(updateError)throw updateError;
  if(!updated)throw new Error("訂單已失效或取消，付款成功但需要人工確認");
  try { await syncBookingCalendar(bookingNo); } catch (error) { console.error("付款 Calendar 同步失敗", error); }
  await sendPaidBookingNotification(bookingNo,site);
  return bookingNo;
}
