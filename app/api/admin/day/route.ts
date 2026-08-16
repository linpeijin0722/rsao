import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
export async function GET(r: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const date = r.nextUrl.searchParams.get("date")!,
    id = r.nextUrl.searchParams.get("methodId")!,
    { data, error } = await adminSupabase().rpc("get_available_slots", {
      p_method_id: id,
      p_days: 180,
    });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  const open = new Set(
    (data || [])
      .filter(
        (x: any) =>
          new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
            new Date(x.slot_start),
          ) === date,
      )
      .map((x: any) =>
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: "Asia/Taipei",
        }).format(new Date(x.slot_start)),
      ),
  );
  return NextResponse.json({ open: [...open] });
}
