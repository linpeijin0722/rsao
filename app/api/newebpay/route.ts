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
    const { bookingNo, onlinePayment = false } = await request.json();
    if(!onlinePayment)return NextResponse.json({mode:"bank_transfer"});
    const db = adminSupabase();
    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", lineUid)
      .single();
    const { data: booking, error } = await db
      .from("bookings")
      .select("booking_no,total_price,payment_method,payment_status")
      .eq("booking_no", bookingNo)
      .eq("customer_id", customer?.id || "00000000-0000-0000-0000-000000000000")
      .single();
    if (error || !booking)
      return NextResponse.json({ error: "找不到這筆預約" }, { status: 404 });
    if(booking.payment_status==="paid")return NextResponse.json({error:"此訂單已付款"},{status:409});

    const config = newebpayConfig();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const supportedMethods=new Set(["CREDIT","APPLEPAY","SAMSUNGPAY","ESUNWALLET","CVS","BARCODE"]);
    const enabledMethods=String(process.env.NEWEBPAY_ENABLED_METHODS||"CREDIT,APPLEPAY,SAMSUNGPAY,ESUNWALLET,CVS,BARCODE").split(",").map(value=>value.trim().toUpperCase()).filter(value=>supportedMethods.has(value));
    if(!enabledMethods.length)enabledMethods.push("CREDIT");
    const methodFlags=Object.fromEntries(enabledMethods.map(method=>[method,"1"]));
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
      ClientBackURL: lineUid.startsWith("WEB_") ? `${origin}/payment-complete?order=${encodeURIComponent(booking.booking_no)}&public=1` : origin,
      ...methodFlags,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法啟動藍新付款" },
      { status: 500 },
    );
  }
}
