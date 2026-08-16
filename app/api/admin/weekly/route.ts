import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
export async function POST(r: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json(),
    { error } = await adminSupabase().from("weekly_slot_overrides").upsert(
      {
        weekday: b.weekday,
        start_time: b.startTime,
        is_open: b.isOpen,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "weekday,start_time" },
    );
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
