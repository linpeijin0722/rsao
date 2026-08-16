import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { lunarProfile } from "@/lib/lunar-profile";

const fields =
  "line_display_name,line_picture_url,full_name,gender,full_address,birth_date,lunar_birth_text,zodiac,birth_shichen,profile_completed_at";
async function customer() {
  const uid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!uid) return null;
  const db = adminSupabase(),
    { data, error } = await db
      .from("customers")
      .select(`id,${fields}`)
      .eq("line_user_id", uid)
      .single();
  return error || !data ? null : { db, data };
}
const zodiacNames = [
  "鼠",
  "牛",
  "虎",
  "兔",
  "龍",
  "蛇",
  "馬",
  "羊",
  "猴",
  "雞",
  "狗",
  "豬",
];
function derived(dateValue: string) {
  const date = new Date(`${dateValue}T12:00:00+08:00`),
    formatter = new Intl.DateTimeFormat("zh-TW-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Taipei",
    }),
    parts = formatter.formatToParts(date),
    related = Number(
      parts.find((p: any) => p.type === "relatedYear")?.value ||
        dateValue.slice(0, 4),
    ),
    stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
    branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
    month = String(parts.find((p: any) => p.type === "month")?.value || "").replace(/\D/g, "").padStart(2, "0"),
    day = String(parts.find((p: any) => p.type === "day")?.value || "").replace(/\D/g, "").padStart(2, "0"),
    cycle = related - 4;
  return {
    lunar_birth_text: `民國${related - 1911}${stems[cycle % 10]}${branches[cycle % 12]}年 ${month}月${day}日`,
    zodiac: zodiacNames[cycle % 12],
  };
}
export async function GET() {
  const x = await customer();
  if (!x) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  return NextResponse.json({
    profile: x.data,
    complete: Boolean(x.data.profile_completed_at),
  });
}
export async function POST(request: NextRequest) {
  const x = await customer();
  if (!x) return NextResponse.json({ error: "尚未登入" }, { status: 401 });
  const body = await request.json(),
    full_name = String(body.full_name || "").trim(),
    gender = String(body.gender || ""),
    full_address = String(body.full_address || "").trim(),
    birth_date = String(body.birth_date || ""),
    birth_shichen = String(body.birth_shichen || "");
  if (
    !full_name ||
    !gender ||
    !full_address ||
    !/^\d{4}-\d{2}-\d{2}$/.test(birth_date) ||
    !birth_shichen
  )
    return NextResponse.json({ error: "請完整填寫所有欄位" }, { status: 400 });
  const calculated = lunarProfile(birth_date),
    { data, error } = await x.db
      .from("customers")
      .update({
        full_name,
        gender,
        full_address,
        birth_date,
        birth_shichen,
        ...calculated,
        profile_completed_at: new Date().toISOString(),
      })
      .eq("id", x.data.id)
      .select(fields)
      .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, profile: data });
}
