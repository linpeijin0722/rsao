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
  const d = adminSupabase(),
    [
      { data: rules, error: e1 },
      { data: weekly, error: e2 },
      { data: holidays, error: e3 },
      { data: method, error: e4 },
    ] = await Promise.all([
      d.from("availability_rules").select("*").order("weekday"),
      d.from("weekly_slot_overrides").select("*"),
      d.from("holidays").select("*").order("holiday_date"),
      d.from("consultation_methods").select("id").eq("code", "video").single(),
    ]);
  return e1 || e2 || e3 || e4
    ? NextResponse.json(
        { error: (e1 || e2 || e3 || e4)?.message },
        { status: 500 },
      )
    : NextResponse.json({ rules, weekly, holidays, methodId: method.id });
}
export async function POST(r: NextRequest) {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const b = await r.json();
  if (!b.weekdays?.length || !b.startTime || !b.endTime)
    return NextResponse.json(
      { error: "請完整選擇星期與時間" },
      { status: 400 },
    );
  const rows = b.weekdays.map((weekday: number) => ({
      weekday,
      start_time: b.startTime,
      end_time: b.endTime,
      valid_from: b.validFrom || null,
      valid_until: b.validUntil || null,
      is_active: true,
      is_open: b.isOpen !== false,
    }));
  const db=adminSupabase();
  // 新套用的規則應取代同星期、重疊時段的舊規則，否則舊的「關閉」
  // 規則會讓總覽中間留下零星灰格。
  const {data:oldRules,error:oldRuleError}=await db
    .from("availability_rules")
    .select("id,weekday,start_time,end_time")
    .in("weekday",b.weekdays);
  if(oldRuleError)return NextResponse.json({error:oldRuleError.message},{status:500});
  const overlappingIds=(oldRules||[])
    .filter((rule:any)=>rule.start_time.slice(0,5)<b.endTime&&rule.end_time.slice(0,5)>b.startTime)
    .map((rule:any)=>rule.id);
  if(overlappingIds.length){
    const {error:deleteRuleError}=await db.from("availability_rules").delete().in("id",overlappingIds);
    if(deleteRuleError)return NextResponse.json({error:deleteRuleError.message},{status:500});
  }
  const { error } = await db.from("availability_rules").insert(rows);
  if(!error){
    const {error:overrideError}=await db.from("weekly_slot_overrides").delete().in("weekday",b.weekdays).gte("start_time",b.startTime).lt("start_time",b.endTime);
    if(overrideError)return NextResponse.json({error:overrideError.message},{status:500});
  }
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
export async function DELETE(r: NextRequest) {
  if (!(await ok()))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { error } = await adminSupabase()
    .from("availability_rules")
    .delete()
    .eq("id", r.nextUrl.searchParams.get("id"));
  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ ok: true });
}
