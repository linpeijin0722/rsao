import { after, NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyLineSession } from "@/lib/line-session";
import { adminSupabase } from "@/lib/supabase";
import { lunarProfile } from "@/lib/lunar-profile";
import { createConsultationSheets } from "@/lib/google-consultation-sheets";
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
    .select("id,booking_no,payment_status,data_submitted_at,booking_details(id,item_title,quantity,booking_items(code),booking_detail_sub_items(sub_item_title))")
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
  const detailIds=(x.b.booking_details || []).map((d:any)=>d.id);
  const [{data:profiles},{data:links}]=await Promise.all([
    x.db.from("consultation_profiles").select("*").eq("customer_id",x.c.id).order("created_at"),
    x.db.from("booking_consultation_answers").select("id,booking_detail_id,profile_id,questions,extra_data,booking_answer_participants(profile_id,position)").in("booking_detail_id",detailIds),
  ]);
  for (const profile of profiles || []) {
    if (profile.birth_date) {
      const calculated = lunarProfile(profile.birth_date);
      profile.lunar_birth_text=calculated.lunar_birth_text;
      profile.zodiac=calculated.zodiac;
    }
    if (profile.death_date) profile.lunar_death_text=lunarProfile(profile.death_date).lunar_birth_text;
  }
  for(const detail of x.b.booking_details||[]){const answer=(links||[]).find((a:any)=>a.booking_detail_id===detail.id);(detail as any).answer_extra_data=answer?.extra_data||{}}
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
  if (body.action === "submit") {
    const detailIds=(x.b.booking_details||[]).map((d:any)=>d.id),{data:answers}=await x.db.from("booking_consultation_answers").select("booking_detail_id").in("booking_detail_id",detailIds);
    if (!detailIds.length || new Set((answers||[]).map((a:any)=>a.booking_detail_id)).size !== detailIds.length) return NextResponse.json({error:"請先儲存每一個項目的問事資料"},{status:400});
    const { error: submittedError } = await x.db.from("bookings").update({data_submitted_at:new Date().toISOString()}).eq("id",x.b.id);
    if (submittedError) return NextResponse.json({error:"資料送出失敗，請稍後再試"},{status:500});
    after(async () => {
      try {
        await createConsultationSheets(x.db,x.b.id,x.b.booking_no);
      } catch (error) {
        console.error("建立諮詢試算表失敗", error);
      }
    });
    return NextResponse.json({ok:true,submitted:true});
  }
  if (body.action === "update_profile") {
    const profile={...body.profile};if(!profile.owner_profile_id)delete profile.owner_profile_id;for(const key of ["birth_date","death_date","birth_time"])if(!profile[key])delete profile[key];
    const {error}=await x.db.from("consultation_profiles").update({...profile,updated_at:new Date().toISOString()}).eq("id",body.profileId).eq("customer_id",x.c.id);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if (body.action === "delete_profile") {
    const {data:p}=await x.db.from("consultation_profiles").select("relationship").eq("id",body.profileId).eq("customer_id",x.c.id).single();
    if(p?.relationship==="本人")return NextResponse.json({error:"本人資料不能刪除"},{status:400});
    const {error}=await x.db.from("consultation_profiles").delete().eq("id",body.profileId).eq("customer_id",x.c.id);
    return error?NextResponse.json({error:"此資料已被預約使用，不能刪除；您仍可編輯。"},{status:400}):NextResponse.json({ok:true});
  }
  if (x.b.data_submitted_at) return NextResponse.json({error:"資料已送出，如需修改請透過 LINE 聯絡助理"},{status:400});
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
      ? body.questions.map((value: unknown) => String(value || "").trim()).slice(0, 9)
      : [];
    const {data:answer}=await x.db.from("booking_consultation_answers").upsert(
      { booking_detail_id: body.detailId, profile_id: profileId, questions, extra_data: body.extraData || {}, updated_at: new Date().toISOString() },
      { onConflict: "booking_detail_id" },
    ).select("id").single();
    if(answer&&Array.isArray(body.profileIds)){
      await x.db.from("booking_answer_participants").delete().eq("answer_id",answer.id);
      const participants=body.profileIds.filter(Boolean).map((id:string,position:number)=>({answer_id:answer.id,profile_id:id,position}));
      if(participants.length)await x.db.from("booking_answer_participants").insert(participants);
    }
    if(body.extraData?.pregnancy_losses&&profileId){await x.db.from("consultation_profiles").update({pregnancy_losses:body.extraData.pregnancy_losses,updated_at:new Date().toISOString()}).eq("id",profileId).eq("customer_id",x.c.id)}
    /* 保留舊後台的完成狀態判斷。 */
    await x.db.from("booking_detail_profiles").upsert({ booking_detail_id: body.detailId, profile_id: profileId });
  }
  return NextResponse.json({ ok: true, profileId });
}
