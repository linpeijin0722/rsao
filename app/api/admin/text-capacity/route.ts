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
    [{ data: settings }, { count }] = await Promise.all([
      db.from("text_capacity_settings").select("*").eq("id", true).single(),
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
  return NextResponse.json({ settings, used: count || 0 });
}
export async function POST(r: NextRequest) {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json(),
    { error } = await adminSupabase()
      .from("text_capacity_settings")
      .upsert({
        id: true,
        enabled: Boolean(b.enabled),
        monthly_limit: b.monthlyLimit === "" ? null : Number(b.monthlyLimit),
        weekly_release_day: b.weeklyDay === "" ? null : Number(b.weeklyDay),
        weekly_release_count:
          b.weeklyCount === "" ? null : Number(b.weeklyCount),
        updated_at: new Date().toISOString(),
      });
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
