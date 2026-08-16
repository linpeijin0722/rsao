import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { bookingNoFromTradeNo, checkMacValue, ecpayConfig } from "@/lib/ecpay";

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
      await adminSupabase()
        .from("bookings")
        .update({ payment_status: "paid", status: "confirmed" })
        .eq("booking_no", bookingNo);
    }
    return new NextResponse("1|OK");
  } catch {
    return new NextResponse("0|Error", { status: 400 });
  }
}
