import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { bookingNoFromTradeNo, checkMacValue, ecpayConfig } from "@/lib/ecpay";
import { bookingFlex, pushLineFlex } from "@/lib/line-message";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const fields = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
    const config = ecpayConfig();
    if (
      checkMacValue(fields, config.hashKey, config.hashIv) !==
      String(fields.CheckMacValue || "").toUpperCase()
    )
      return new NextResponse("0|CheckMacValue Error", { status: 400 });
    const bookingNo = bookingNoFromTradeNo(fields.MerchantTradeNo || "");
    if (fields.RtnCode === "1" && bookingNo) {
      const db = adminSupabase();
      await db
        .from("bookings")
        .update({
          payment_status: "paid",
          payment_method: String(fields.PaymentType || "").toLowerCase().includes("linepay") ? "line_pay" : String(fields.PaymentType || "").toLowerCase().includes("credit") ? "credit_card" : "transfer",
          status: "confirmed",
          paid_at: new Date().toISOString(),
        })
        .eq("booking_no", bookingNo)
        .eq("status", "pending_payment");
      const { data: booking } = await db
        .from("bookings")
        .select(
          "booking_no,total_price,slot_start,slot_end,payment_status,payment_notified_at,customers(line_user_id),consultation_methods(code)",
        )
        .eq("booking_no", bookingNo)
        .single();
      if (
        booking &&
        booking.payment_status === "paid" &&
        !booking.payment_notified_at
      ) {
        const customer = booking.customers as unknown as {
            line_user_id: string;
          },
          method = booking.consultation_methods as unknown as { code: string };
        const stamp = (value: string) =>
          new Date(value)
            .toISOString()
            .replace(/[-:]/g, "")
            .replace(/\.\d{3}/, "");
        const slot =
          booking.slot_start && booking.slot_end
            ? `${stamp(booking.slot_start)}/${stamp(booking.slot_end)}`
            : undefined;
        await pushLineFlex(
          customer.line_user_id,
          "林阿嫂預約付款完成",
          bookingFlex({
            bookingNo,
            total: booking.total_price,
            method: method.code,
            slot,
            site: process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
          }),
        );
        await db
          .from("bookings")
          .update({ payment_notified_at: new Date().toISOString() })
          .eq("booking_no", bookingNo);
      }
    }
    return new NextResponse("1|OK");
  } catch {
    return new NextResponse("0|Error", { status: 400 });
  }
}
