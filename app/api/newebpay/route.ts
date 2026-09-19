import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { encryptTradeInfo, newebpayConfig, newebpayMerchantOrderNo, tradeSha } from "@/lib/newebpay";
import { paymentSettings } from "@/lib/payment-mode";

export async function POST(request: NextRequest) {
  try {
    const lineUid = verifyLineSession((await cookies()).get("line_session")?.value);
    if (!lineUid)
      return NextResponse.json({ error: "LINE 登入已失效" }, { status: 401 });
    const payment=await paymentSettings();
    if(payment.effective_mode==="bank_transfer")return NextResponse.json({mode:"bank_transfer"});
    const { bookingNo } = await request.json();
    const db = adminSupabase();
    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", lineUid)
      .single();
    const { data: booking, error } = await db
      .from("bookings")
      .select("booking_no,total_price,payment_method")
      .eq("booking_no", bookingNo)
      .eq("customer_id", customer?.id || "00000000-0000-0000-0000-000000000000")
      .single();
    if (error || !booking)
      return NextResponse.json({ error: "找不到這筆預約" }, { status: 404 });
    if (!["credit_card", "transfer"].includes(booking.payment_method))
      return NextResponse.json({ error: "此付款方式不使用藍新金流" }, { status: 400 });

    const config = newebpayConfig();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const params = new URLSearchParams({
      MerchantID: config.merchantId,
      RespondType: "JSON",
      TimeStamp: String(Math.floor(Date.now() / 1000)),
      Version: "2.0",
      MerchantOrderNo: newebpayMerchantOrderNo(booking.booking_no),
      Amt: String(booking.total_price),
      ItemDesc: "林阿嫂線上諮詢預約",
      ReturnURL: `${origin}/api/newebpay/return`,
      NotifyURL: `${origin}/api/newebpay/notify`,
      ClientBackURL: origin,
      ...(booking.payment_method === "credit_card" ? { CREDIT: "1" } : { VACC: "1" }),
    });
    const tradeInfo = encryptTradeInfo(
      params.toString(),
      config.hashKey,
      config.hashIv,
    );
    return NextResponse.json({
      mode:"newebpay",
      action: config.gateway,
      fields: {
        MerchantID: config.merchantId,
        TradeInfo: tradeInfo,
        TradeSha: tradeSha(tradeInfo, config.hashKey, config.hashIv),
        Version: "2.0",
      },
    });
  } catch (error) {
    // In auto mode, a server-side gateway initialization failure temporarily
    // falls back to bank transfer. The timeout lets the site retry NewebPay
    // automatically after the transient failure has had time to clear.
    try {
      const db = adminSupabase();
      const disabledUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      await db
        .from("booking_system_settings")
        .update({
          gateway_disabled_until: disabledUntil,
          gateway_failure_reason:
            error instanceof Error ? error.message.slice(0, 500) : "無法啟動藍新付款",
        })
        .eq("id", true)
        .eq("payment_mode", "auto");
    } catch {
      // Preserve the original payment error even if recording the fallback fails.
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法啟動藍新付款" },
      { status: 500 },
    );
  }
}
