import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
async function allowed() {
  return isAdminSession((await cookies()).get("admin_session")?.value);
}
export async function GET(r: NextRequest) {
  if (!(await allowed()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const id = r.nextUrl.searchParams.get("methodId"),
    db = adminSupabase(),
    [{ data: slots, error: e1 }, { data: overrides, error: e2 }] =
      await Promise.all([
        db.rpc("get_available_slots", { p_method_id: id, p_days: 90 }),
        db
          .from("slot_overrides")
          .select("slot_start,is_open")
          .eq("consultation_method_id", id)
          .gte("slot_start", new Date().toISOString())
          .order("slot_start"),
      ]);
  return e1 || e2
    ? NextResponse.json({ error: (e1 || e2)?.message }, { status: 500 })
    : NextResponse.json({ slots, overrides });
}
export async function POST(r: NextRequest) {
  if (!(await allowed()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json(),
    db = adminSupabase();
  const resolveVideoMethodId = async () => {
    if (b.methodId) return String(b.methodId);
    const { data, error } = await db.from("consultation_methods").select("id").eq("code", "video").single();
    if (error || !data?.id) throw new Error("找不到視訊諮詢設定，請重新整理後再試");
    return String(data.id);
  };
  if (b.action === "close_day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || ""))
      return NextResponse.json({ error: "日期資料不完整" }, { status: 400 });
    const methodId = await resolveVideoMethodId();
    const rows = Array.from({ length: 32 }, (_, index) => {
      const hour = 7 + Math.floor(index / 2), minute = index % 2 ? "30" : "00";
      return { consultation_method_id: methodId, slot_start: `${b.date}T${String(hour).padStart(2, "0")}:${minute}:00+08:00`, is_open: false, updated_at: new Date().toISOString() };
    });
    const { error } = await db.from("slot_overrides").upsert(rows, { onConflict: "consultation_method_id,slot_start" });
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true, closed: rows.length });
  }
  if (b.action === "close_all") {
    // 「清除所有時段」只清除時段設定，絕對不碰 booking_system_settings.video_booking_enabled。
    // 先移除一般規則，再清除週／單日時段覆寫；前台總開關維持使用者原本設定。
    const { error: ruleError } = await db.from("availability_rules").delete().not("id", "is", null);
    if (ruleError) return NextResponse.json({ error: ruleError.message }, { status: 500 });
    const { error: weeklyError } = await db.from("weekly_slot_overrides").delete().not("weekday", "is", null);
    if (weeklyError) return NextResponse.json({ error: weeklyError.message }, { status: 500 });
    const methodId = await resolveVideoMethodId();
    const { error: slotError } = await db.from("slot_overrides").delete().eq("consultation_method_id", methodId);
    return slotError ? NextResponse.json({ error: slotError.message }, { status: 500 }) : NextResponse.json({ ok: true, cleared: true });
  }
  if (!b.slotStart) return NextResponse.json({ error: "缺少時段資料，請重新整理後再試" }, { status: 400 });
  const methodId = await resolveVideoMethodId();
  const { error } = await db.from("slot_overrides").upsert(
      {
        consultation_method_id: methodId,
        slot_start: b.slotStart,
        is_open: b.isOpen,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "consultation_method_id,slot_start" },
    );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
