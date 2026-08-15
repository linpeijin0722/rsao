import { NextRequest, NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name?.trim() || !/^09\d{8}$/.test(body.phone ?? "") || !body.methodId || !Array.isArray(body.items) || body.items.length === 0 || !body.paymentMethod) {
      return NextResponse.json({ error: "請完整填寫姓名、手機、項目與付款方式" }, { status: 400 });
    }
    const { data, error } = await publicSupabase().rpc("create_booking", {
      p_method_id: body.methodId,
      p_customer_name: body.name.trim(),
      p_customer_phone: body.phone,
      p_line_user_id: body.lineId || null,
      p_slot_start: body.slotStart || null,
      p_payment_method: body.paymentMethod,
      p_items: body.items,
    });
    if (error) throw error;
    return NextResponse.json({ booking: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "預約建立失敗" }, { status: 500 });
  }
}
