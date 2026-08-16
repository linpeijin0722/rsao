import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
async function context(order: string) {
  const uid = verifyLineSession((await cookies()).get("line_session")?.value);
  if (!uid) return null;
  const db = adminSupabase(),
    { data: c } = await db
      .from("customers")
      .select("id,full_name,gender,full_address,birth_date,lunar_birth_text,zodiac,birth_shichen")
      .eq("line_user_id", uid)
      .single();
  if (!c) return null;
  const { data: b } = await db
    .from("bookings")
    .select("id,booking_no,payment_status,booking_details(id,item_title,quantity,booking_items(code),booking_detail_sub_items(sub_item_title))")
    .eq("booking_no", order)
    .eq("customer_id", c.id)
    .single();
  return b ? { db, c, b } : null;
}
export async function GET(r: NextRequest) {
  const x = await context(r.nextUrl.searchParams.get("order") || "");
  if (!x)
    return NextResponse.json(
      { error: "找不到訂單或登入已失效" },
      { status: 401 },
    );
  const { data: selfProfile } = await x.db.from("consultation_profiles").select("id").eq("customer_id", x.c.id).eq("relationship", "本人").maybeSingle();
  if (!selfProfile && x.c.full_name) {
    await x.db.from("consultation_profiles").insert({ customer_id:x.c.id, profile_type:"person", relationship:"本人", name:x.c.full_name, gender:x.c.gender, address:x.c.full_address, birth_date:x.c.birth_date, lunar_birth_text:x.c.lunar_birth_text, zodiac:x.c.zodiac, birth_shichen:x.c.birth_shichen });
  }
  const { data: profiles } = await x.db
    .from("consultation_profiles")
    .select("*")
    .eq("customer_id", x.c.id)
    .order("created_at");
  const { data: links } = await x.db
    .from("booking_consultation_answers")
    .select("booking_detail_id,profile_id,questions")
    .in(
      "booking_detail_id",
      (x.b.booking_details || []).map((d: any) => d.id),
    );
  return NextResponse.json({
    booking: x.b,
    customer: x.c,
    profiles: profiles || [],
    links: links || [],
  });
}
export async function POST(r: NextRequest) {
  const body = await r.json(),
    x = await context(body.order || "");
  if (!x)
    return NextResponse.json(
      { error: "找不到訂單或登入已失效" },
      { status: 401 },
    );
  if (x.b.payment_status !== "paid")
    return NextResponse.json({ error: "完成付款後才能填寫問事資料" }, { status: 400 });
  let profileId = body.profileId;
  if (body.profile) {
    const profile = { ...body.profile };
    if (!profile.owner_profile_id) delete profile.owner_profile_id;
    for (const key of ["birth_date", "death_date", "birth_time"]) {
      if (!profile[key]) delete profile[key];
    }
    const { data, error } = await x.db
      .from("consultation_profiles")
      .insert({ ...profile, customer_id: x.c.id })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    profileId = data.id;
  }
  if (body.detailId && profileId) {
    const valid = (x.b.booking_details || []).some(
      (d: any) => d.id === body.detailId,
    );
    if (!valid)
      return NextResponse.json({ error: "項目不屬於此訂單" }, { status: 400 });
    const questions = Array.isArray(body.questions)
      ? body.questions.map((value: unknown) => String(value || "").trim()).slice(0, 3)
      : [];
    await x.db.from("booking_consultation_answers").upsert(
      { booking_detail_id: body.detailId, profile_id: profileId, questions, updated_at: new Date().toISOString() },
      { onConflict: "booking_detail_id" },
    );
    /* 保留舊後台的完成狀態判斷。 */
    await x.db.from("booking_detail_profiles").upsert({ booking_detail_id: body.detailId, profile_id: profileId });
  }
  return NextResponse.json({ ok: true, profileId });
}
