import { NextRequest, NextResponse } from "next/server";
import { bookingNoFromTradeNo, checkMacValue, ecpayConfig } from "@/lib/ecpay";
import { confirmPayment } from "@/lib/payment-confirm";
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const fields = Object.fromEntries([...form.entries()].map(([key, value]) => [key, String(value)]));
  const config = ecpayConfig();
  let order = bookingNoFromTradeNo(fields.MerchantTradeNo || "");
  if (checkMacValue(fields, config.hashKey, config.hashIv) === String(fields.CheckMacValue || "").toUpperCase()) {
    order = (await confirmPayment(fields, process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin)) || order;
  }
  return NextResponse.redirect(
    new URL(
      `/payment-complete?order=${encodeURIComponent(order)}`,
      request.url,
    ),
    303,
  );
}
