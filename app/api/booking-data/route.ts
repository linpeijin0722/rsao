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
      .select("id")
      .eq("line_user_id", uid)
      .single();
  if (!c) return null;
  const { data: b } = await db
    .from("bookings")
    .select("id,booking_no,booking_details(id,item_title)")
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
  const { data: profiles } = await x.db
    .from("consultation_profiles")
    .select("*")
    .eq("customer_id", x.c.id)
    .order("created_at");
  const { data: links } = await x.db
    .from("booking_detail_profiles")
    .select("booking_detail_id,profile_id")
    .in(
      "booking_detail_id",
      (x.b.booking_details || []).map((d: any) => d.id),
    );
  return NextResponse.json({
    booking: x.b,
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
  let profileId = body.profileId;
  if (body.profile) {
    const { data, error } = await x.db
      .from("consultation_profiles")
      .insert({ ...body.profile, customer_id: x.c.id })
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
    await x.db
      .from("booking_detail_profiles")
      .upsert({ booking_detail_id: body.detailId, profile_id: profileId });
  }
  return NextResponse.json({ ok: true, profileId });
}
