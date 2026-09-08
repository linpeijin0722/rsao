import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
async function ok() {
  return isAdminSession((await cookies()).get("admin_session")?.value);
}
export async function GET() {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const db = adminSupabase(),
    [{ data: settings }, { data: weekly }, { data: overrides }, { count }] = await Promise.all([
      db.from("text_capacity_settings").select("*").eq("id", true).single(),
      db.from("text_weekly_release_rules").select("*").order("weekday"),
      db.from("text_capacity_date_overrides").select("*").order("release_date"),
      db
        .from("bookings")
        .select("id,consultation_methods!inner(code)", {
          count: "exact",
          head: true,
        })
        .eq("consultation_methods.code", "text")
        .neq("status", "cancelled")
        .gte(
          "created_at",
          new Date(
            new Date().getFullYear(),
            new Date().getMonth(),
            1,
          ).toISOString(),
        ),
    ]);
  return NextResponse.json({
    settings,
    weekly: weekly || [],
    overrides: overrides || [],
    used: count || 0,
  });
}
export async function POST(r: NextRequest) {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json(),
    db = adminSupabase(),
    { error } = await db.from("text_capacity_settings").upsert({
      id: true,
      enabled: Boolean(b.enabled),
      mode: b.mode === "weekly" ? "weekly" : "monthly",
      release_time: b.releaseTime || "15:00",
      monthly_limit: b.monthlyLimit === "" ? null : Number(b.monthlyLimit),
      updated_at: new Date().toISOString(),
    });
  if (!error && Array.isArray(b.weekly)) {
    const { error: weeklyError } = await db.from("text_weekly_release_rules").upsert(
      b.weekly.map(
        (x: {
          weekday: number;
          enabled: boolean;
          release_count: number | string;
        }) => ({
          weekday: x.weekday,
          enabled: Boolean(x.enabled),
          release_count: Number(x.release_count) || 0,
          updated_at: new Date().toISOString(),
        }),
      ),
    );
    if (weeklyError) return NextResponse.json({ error: weeklyError.message }, { status: 400 });
  }
  if (!error && Array.isArray(b.overrides)) {
    const normalized = b.overrides.map((x: { release_date?: string; release_count?: number | string; note?: string }) => ({
      release_date: String(x.release_date || ""),
      release_count: Math.max(0, Number(x.release_count) || 0),
      note: String(x.note || "").trim() || null,
      updated_at: new Date().toISOString(),
    })).filter((x: { release_date: string }) => /^\d{4}-\d{2}-\d{2}$/.test(x.release_date));
    const { data: current } = await db.from("text_capacity_date_overrides").select("release_date");
    const keep = new Set(normalized.map((x: { release_date: string }) => x.release_date));
    const remove = (current || []).map((x: { release_date: string }) => x.release_date).filter((date: string) => !keep.has(date));
    if (remove.length) {
      const { error: deleteError } = await db.from("text_capacity_date_overrides").delete().in("release_date", remove);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
    if (normalized.length) {
      const { error: overrideError } = await db.from("text_capacity_date_overrides").upsert(normalized, { onConflict: "release_date" });
      if (overrideError) return NextResponse.json({ error: overrideError.message }, { status: 400 });
    }
  }
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
