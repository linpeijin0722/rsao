import { NextRequest, NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";
import { verifyLineSession } from "@/lib/line-session";
import { cookies } from "next/headers";
import { isAllowedVideoSlot } from "@/lib/video-booking-window";

export async function POST(request: NextRequest) {
  try {
    const lineUid = verifyLineSession(
      (await cookies()).get("line_session")?.value,
    );
    if (!lineUid)
      return NextResponse.json(
        { error: "LINE 登入已失效，請重新登入" },
        { status: 401 },
      );
    const body = await request.json();
    if (
      !body.methodId ||
      !Array.isArray(body.items) ||
      body.items.length === 0 ||
      !body.paymentMethod
    ) {
      return NextResponse.json(
        { error: "請完整選擇諮詢項目與付款方式" },
        { status: 400 },
      );
    }
    const { data: method, error: methodError } = await publicSupabase()
      .from("consultation_methods")
      .select("code")
      .eq("id", body.methodId)
      .single();
    if (methodError) throw methodError;
    if (method?.code === "video") {
      if (!body.slotStart)
        return NextResponse.json({ error: "請選擇視訊日期與時段" }, { status: 400 });
      if (!isAllowedVideoSlot(body.slotStart))
        return NextResponse.json(
          { error: "視訊諮詢最早只能預約 4 天後的日期，請重新選擇時段" },
          { status: 400 },
        );
    }
    const { data, error } = await publicSupabase().rpc("create_booking", {
      p_method_id: body.methodId,
      p_customer_name: "",
      p_customer_phone: "",
      p_line_user_id: lineUid,
      p_slot_start: body.slotStart || null,
      p_payment_method: body.paymentMethod,
      p_items: body.items,
    });
    if (error) throw error;
    return NextResponse.json({ booking: data });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === "object" && "message" in error
          ? String(error.message)
          : "預約建立失敗";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
