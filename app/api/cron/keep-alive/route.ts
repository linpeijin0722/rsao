import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "未授權" }, { status: 401 });
  }

  const { data, error } = await adminSupabase().rpc("record_system_heartbeat");
  if (error) {
    console.error("Supabase 每日保活失敗", error);
    return NextResponse.json({ error: "保活失敗" }, { status: 500 });
  }

  const heartbeat = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, heartbeat });
}
