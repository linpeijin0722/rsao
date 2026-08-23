import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";

const dateKey = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date(value),
  );

export async function GET(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const methodId = request.nextUrl.searchParams.get("methodId");
  const month = request.nextUrl.searchParams.get("month");
  if (!methodId || !month)
    return NextResponse.json({ error: "缺少月份或諮詢方式" }, { status: 400 });

  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber, 1);
  const days = Math.min(
    730,
    Math.max(32, Math.ceil((end.getTime() - Date.now()) / 86400000) + 2),
  );
  const { data, error } = await adminSupabase().rpc("get_available_slots", {
    p_method_id: methodId,
    p_days: days,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const dates = [
    ...new Set(
      (data || [])
        .map((row: { slot_start: string }) => dateKey(row.slot_start))
        .filter((date: string) => date.startsWith(month)),
    ),
  ];
  return NextResponse.json({ dates });
}
