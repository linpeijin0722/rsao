import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { encryptTradeInfo, newebpayConfig, tradeSha } from "@/lib/newebpay";

export async function POST(request: NextRequest) {
  try {
    const lineUid = verifyLineSession((await cookies()).get("line_session")?.value);
    if (!lineUid)
      return NextResponse.json({ error: "LINE 登入已失效" }, { status: 401 });
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
      MerchantOrderNo: booking.booking_no,
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
      action: config.gateway,
      fields: {
        MerchantID: config.merchantId,
        TradeInfo: tradeInfo,
        TradeSha: tradeSha(tradeInfo, config.hashKey, config.hashIv),
        Version: "2.0",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法啟動藍新付款" },
      { status: 500 },
    );
  }
}
