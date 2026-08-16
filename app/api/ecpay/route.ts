import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { checkMacValue, compactTradeNo, ecpayConfig } from "@/lib/ecpay";

const taiwanTime = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
};

export async function POST(request: NextRequest) {
  try {
    const lineUid = verifyLineSession(
      (await cookies()).get("line_session")?.value,
    );
    if (!lineUid)
      return NextResponse.json({ error: "LINE 登入已失效" }, { status: 401 });
    const { bookingNo } = await request.json();
    const db = adminSupabase();
    await db.rpc("expire_unpaid_bookings");
    const { data: customer } = await db
      .from("customers")
      .select("id")
      .eq("line_user_id", lineUid)
      .single();
    const { data: booking, error } = await db
      .from("bookings")
      .select("booking_no,total_price,payment_method,status,payment_status")
      .eq("booking_no", bookingNo)
      .eq("customer_id", customer?.id || "00000000-0000-0000-0000-000000000000")
      .single();
    if (error || !booking)
      return NextResponse.json({ error: "找不到這筆預約" }, { status: 404 });
    if (booking.status === "cancelled" || booking.payment_status === "failed")
      return NextResponse.json(
        { error: "此訂單已失效，請重新預約" },
        { status: 400 },
      );
    if (!["credit_card", "transfer"].includes(booking.payment_method))
      return NextResponse.json(
        { error: "此付款方式不使用綠界金流" },
        { status: 400 },
      );

    const config = ecpayConfig();
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const fields: Record<string, string> = {
      MerchantID: config.merchantId,
      MerchantTradeNo: compactTradeNo(booking.booking_no),
      MerchantTradeDate: taiwanTime(),
      PaymentType: "aio",
      TotalAmount: String(booking.total_price),
      TradeDesc: "林阿嫂線上諮詢預約",
      ItemName: "林阿嫂線上諮詢預約",
      ReturnURL: `${origin}/api/ecpay/notify`,
      OrderResultURL: `${origin}/api/ecpay/return`,
      ClientBackURL: origin,
      ChoosePayment:
        booking.payment_method === "credit_card" ? "Credit" : "ATM",
      EncryptType: "1",
    };
    fields.CheckMacValue = checkMacValue(fields, config.hashKey, config.hashIv);
    return NextResponse.json({ action: config.gateway, fields });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法啟動綠界付款" },
      { status: 500 },
    );
  }
}
