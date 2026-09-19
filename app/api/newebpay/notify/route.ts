import { NextRequest, NextResponse } from "next/server";
import { bookingNoFromNewebpayOrderNo, decryptTradeInfo, newebpayConfig, tradeSha } from "@/lib/newebpay";
import { confirmNewebPayment } from "@/lib/payment-confirm";

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const info = String(form.get("TradeInfo") || "");
    const sha = String(form.get("TradeSha") || "").toUpperCase();
    const config = newebpayConfig();
    if (!info || tradeSha(info, config.hashKey, config.hashIv) !== sha)
      return new NextResponse("ERROR", { status: 400 });
    const payload = JSON.parse(decryptTradeInfo(info, config.hashKey, config.hashIv));
    const bookingNo = payload?.Result?.MerchantOrderNo;
    if (payload?.Status === "SUCCESS" && bookingNo) {
      await confirmNewebPayment(
        bookingNoFromNewebpayOrderNo(String(bookingNo)),
        String(payload?.Result?.PaymentType || ""),
        process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
      );
    }
    return new NextResponse("SUCCESS");
  } catch {
    return new NextResponse("ERROR", { status: 400 });
  }
}
