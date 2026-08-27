import { NextRequest, NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";
import { earliestVideoBookingDate, taipeiDateKey } from "@/lib/video-booking-window";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const methodId = request.nextUrl.searchParams.get("methodId");
  if (!methodId)
    return NextResponse.json({ error: "缺少諮詢方式" }, { status: 400 });
  try {
    const { data, error } = await publicSupabase().rpc("get_available_slots", {
      p_method_id: methodId,
      p_days: 63,
    });
    if (error) throw error;
    const earliestDate = earliestVideoBookingDate();
    const slots = (data ?? []).filter(
      (slot: { slot_start?: string }) =>
        slot.slot_start && taipeiDateKey(slot.slot_start) >= earliestDate,
    );
    return NextResponse.json({ slots, earliestDate });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "無法讀取時段" },
      { status: 500 },
    );
  }
}
