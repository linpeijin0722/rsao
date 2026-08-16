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
    [{ data: settings }, { data: weekly }, { count }] = await Promise.all([
      db.from("text_capacity_settings").select("*").eq("id", true).single(),
      db.from("text_weekly_release_rules").select("*").order("weekday"),
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
  if (!error && Array.isArray(b.weekly))
    await db
      .from("text_weekly_release_rules")
      .upsert(
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
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
