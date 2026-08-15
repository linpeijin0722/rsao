import { NextRequest, NextResponse } from "next/server";
import { publicSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const methodId = request.nextUrl.searchParams.get("methodId");
  if (!methodId) return NextResponse.json({ error: "缺少諮詢方式" }, { status: 400 });
  try {
    const { data, error } = await publicSupabase().rpc("get_available_slots", { p_method_id: methodId, p_days: 30 });
    if (error) throw error;
    return NextResponse.json({ slots: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "無法讀取時段" }, { status: 500 });
  }
}
