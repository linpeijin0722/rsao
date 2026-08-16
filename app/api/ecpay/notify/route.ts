import { NextRequest, NextResponse } from "next/server";
import { checkMacValue, ecpayConfig } from "@/lib/ecpay";
import { confirmPayment } from "@/lib/payment-confirm";

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
    await confirmPayment(fields, process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin);
    return new NextResponse("1|OK");
  } catch {
    return new NextResponse("0|Error", { status: 400 });
  }
}
