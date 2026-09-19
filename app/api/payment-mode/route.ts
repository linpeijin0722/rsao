import { NextResponse } from "next/server";
import { paymentSettings } from "@/lib/payment-mode";
export async function GET(){try{return NextResponse.json(await paymentSettings())}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"讀取付款方式失敗"},{status:500})}}
