import { NextRequest, NextResponse } from "next/server";
import { bookingNoFromTradeNo } from "@/lib/ecpay";
export async function POST(request: NextRequest) {
  const form = await request.formData(),
    order = bookingNoFromTradeNo(String(form.get("MerchantTradeNo") || ""));
  return NextResponse.redirect(
    new URL(
      `/payment-complete?order=${encodeURIComponent(order)}`,
      request.url,
    ),
    303,
  );
}
