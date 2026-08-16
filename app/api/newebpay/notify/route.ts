import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { decryptTradeInfo, newebpayConfig, tradeSha } from "@/lib/newebpay";

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
      await adminSupabase()
        .from("bookings")
        .update({ payment_status: "paid", status: "confirmed" })
        .eq("booking_no", bookingNo);
    }
    return new NextResponse("SUCCESS");
  } catch {
    return new NextResponse("ERROR", { status: 400 });
  }
}
