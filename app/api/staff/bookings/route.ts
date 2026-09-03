import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { bookingStatusFlex, pushLineFlex } from "@/lib/line-message";
import { createConsultationDocuments, wasDocumentEditedBy } from "@/lib/google-consultation-docs";
export async function GET() {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const db = adminSupabase();
  const [{ data, error }, { data: customers, error: customerError }, { data: consultationProfiles, error: profileError }] = await Promise.all([db
    .from("bookings")
    .select(
      "id,booking_no,slot_start,total_price,payment_method,payment_status,collection_source,data_submitted_at,status,cancellation_reason,paid_at,created_at,customers(id,line_user_id,line_display_name,line_picture_url,full_name,gender,full_address,birth_date,lunar_birth_text,zodiac,birth_shichen),consultation_methods(id,code,title,base_price),booking_details(id,item_id,item_title,quantity,google_document_id,google_document_url,google_document_created_at,google_sheet_url,booking_items(code),booking_detail_sub_items(sub_item_id,sub_item_title),booking_detail_profiles(profile_id,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data)),booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data),booking_answer_participants(position,profile_id,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data))))",
    )
    .order("created_at", { ascending: false }), db
    .from("customers")
    .select("id,line_user_id,line_display_name,line_picture_url,full_name,birth_date")
    .not("line_user_id", "is", null)
    .not("full_name", "is", null)
    .neq("full_name", "")
    .order("line_display_name", { ascending: true }), db
    .from("consultation_profiles")
    .select("id,customer_id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data")
    .order("name", { ascending: true })]);
  if (error || customerError || profileError)
    return NextResponse.json({ error: error?.message || customerError?.message || profileError?.message }, { status: 500 });
  const bookings:any[]=(data||[]) as any[];
  const answers=bookings.flatMap((booking:any)=>(booking.booking_details||[]).flatMap((detail:any)=>detail.booking_consultation_answers||[]));
  const answerIds=[...new Set(answers.map((answer:any)=>answer.id).filter(Boolean))];
  // PostgREST 的深層關聯在舊資料上偶爾只回第一位參與者；另查一次並依位置
  // 補回，確保「修改用戶資料」能顯示該筆問事實際選到的所有人物。
  if(answerIds.length){
    const {data:participants,error:participantError}=await db
      .from("booking_answer_participants")
      .select("answer_id,position,profile_id,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data)")
      .in("answer_id",answerIds)
      .order("position",{ascending:true});
    if(participantError)return NextResponse.json({error:participantError.message},{status:500});
    const grouped=new Map<string,any[]>();
    for(const participant of participants||[]){
      const list=grouped.get((participant as any).answer_id)||[];
      list.push(participant);
      grouped.set((participant as any).answer_id,list);
    }
    for(const answer of answers)answer.booking_answer_participants=grouped.get(answer.id)||answer.booking_answer_participants||[];
  }
  const bookingIds=bookings.map((booking:any)=>booking.id).filter(Boolean);
  if(bookingIds.length){
    const {data:submissions,error:submissionError}=await db.from("booking_data_submissions").select("id,booking_id,submitted_at,payload").in("booking_id",bookingIds).order("submitted_at",{ascending:false});
    if(submissionError)return NextResponse.json({error:submissionError.message},{status:500});
    for(const booking of bookings)booking.data_submissions=(submissions||[]).filter((submission:any)=>submission.booking_id===booking.id);
  }
  return NextResponse.json({ bookings, customers: customers || [], consultationProfiles: consultationProfiles || [] });
}
export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(), { bookingNo, action } = body;
  if (action === "create_manual_booking") {
    const db = adminSupabase(), methodCode = body.methodCode === "video" ? "video" : "text",
      lines = Array.isArray(body.lines) ? body.lines : [];
    if (!body.customerId) return NextResponse.json({ error: "請選擇用戶" }, { status: 400 });
    if (!lines.length) return NextResponse.json({ error: "請至少選擇一個諮詢項目" }, { status: 400 });
    const [{ data: customer }, { data: method }] = await Promise.all([
      db.from("customers").select("id,line_user_id,line_display_name,full_name,profile_completed_at").eq("id", body.customerId).single(),
      db.from("consultation_methods").select("id,code,title,base_price,duration_minutes").eq("code", methodCode).eq("is_active", true).single(),
    ]);
    if (!customer?.line_user_id || !customer.full_name)
      return NextResponse.json({ error: "這位用戶尚未完成 LINE 登入與本人資料" }, { status: 400 });
    if (!method) return NextResponse.json({ error: "諮詢方式目前未開放" }, { status: 400 });
    let slotStart: string | null = null, slotEnd: string | null = null;
    if (methodCode === "video") {
      const start = new Date(String(body.slotStart || ""));
      if (Number.isNaN(start.getTime())) return NextResponse.json({ error: "請選擇視訊時間" }, { status: 400 });
      slotStart = start.toISOString();
      slotEnd = new Date(start.getTime() + Math.max(1, Number(method.duration_minutes) || 25) * 60000).toISOString();
      const { data: occupied } = await db.from("bookings").select("id").eq("consultation_method_id", method.id).eq("slot_start", slotStart).neq("status", "cancelled").maybeSingle();
      if (occupied) return NextResponse.json({ error: "這個視訊時段已經有人預約" }, { status: 409 });
    }
    const itemIds = [...new Set(lines.map((line: any) => String(line.itemId || "")).filter(Boolean))],
      subIds = [...new Set(lines.map((line: any) => String(line.subId || "")).filter(Boolean))];
    const [{ data: catalogItems }, { data: catalogSubs }] = await Promise.all([
      db.from("booking_items").select("id,title,price,option_mode").in("id", itemIds).eq("is_active", true),
      subIds.length ? db.from("sub_items").select("id,item_id,title,price").in("id", subIds).eq("is_active", true) : Promise.resolve({ data: [] as any[] }),
    ]);
    if ((catalogItems || []).length !== itemIds.length) return NextResponse.json({ error: "部分諮詢項目不存在或已停用" }, { status: 400 });
    let subtotal = 0;
    const normalized = lines.map((line: any) => {
      const item = (catalogItems || []).find((candidate: any) => candidate.id === line.itemId),
        sub = (catalogSubs || []).find((candidate: any) => candidate.id === line.subId && candidate.item_id === line.itemId),
        qty = Math.max(1, Math.floor(Number(line.qty) || 1));
      if (!item || (item.option_mode === "single_required" && !sub)) throw new Error(`請完成「${item?.title || "諮詢項目"}」的子項目選擇`);
      const unit = Number(sub?.price ?? item.price ?? 0); subtotal += unit * qty;
      return { item, sub, qty, unit };
    });
    const now = new Date(), taipeiDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).replace(/-/g, ""),
      manualNo = `LAS-${taipeiDate}-${crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      total = subtotal + Number(method.base_price || 0), expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const { data: booking, error: bookingError } = await db.from("bookings").insert({ booking_no: manualNo, customer_id: customer.id, consultation_method_id: method.id, slot_start: slotStart, slot_end: slotEnd, subtotal, total_price: total, payment_method: "credit_card", payment_status: "pending", status: "pending_payment", expires_at: expiresAt }).select("id,booking_no").single();
    if (bookingError || !booking) return NextResponse.json({ error: bookingError?.message || "建立預約失敗" }, { status: 400 });
    try {
      for (const line of normalized) {
        const { data: detail, error: detailError } = await db.from("booking_details").insert({ booking_id: booking.id, item_id: line.item.id, item_title: line.item.title, unit_price: line.unit, quantity: line.qty, line_total: line.unit * line.qty }).select("id").single();
        if (detailError || !detail) throw new Error(detailError?.message || "無法儲存諮詢項目");
        if (line.sub) {
          const { error: subError } = await db.from("booking_detail_sub_items").insert({ booking_detail_id: detail.id, sub_item_id: line.sub.id, sub_item_title: line.sub.title, unit_price: line.sub.price, quantity: line.qty, line_total: Number(line.sub.price) * line.qty });
          if (subError) throw new Error(subError.message);
        }
      }
      if (body.notifyPayment) {
        const site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
        await pushLineFlex(customer.line_user_id,"待付款",bookingStatusFlex({status:"pending",bookingNo:manualNo,method:methodCode,total,slotStart:slotStart||undefined,items:normalized.map((line:any)=>[line.item.title,line.sub?.title].filter(Boolean).join("｜")),expiresAt,site}));
      }
      return NextResponse.json({ ok: true, bookingNo: manualNo, paymentNotified: Boolean(body.notifyPayment) });
    } catch (error) {
      await db.from("bookings").delete().eq("id", booking.id);
      return NextResponse.json({ error: error instanceof Error ? error.message : "建立預約失敗" }, { status: 400 });
    }
  }
  if (action === "check_document_edited") {
    const db=adminSupabase(),{data:booking}=await db.from("bookings").select("id,booking_details(google_document_id)").eq("booking_no",bookingNo).single();
    if(!booking)return NextResponse.json({error:"找不到訂單"},{status:404});
    const documentId=(booking.booking_details||[]).find((detail:any)=>detail.google_document_id)?.google_document_id;
    if(!documentId)return NextResponse.json({ok:true,teacherEdited:false});
    try{return NextResponse.json({ok:true,teacherEdited:await wasDocumentEditedBy(documentId,"jingxuan570820@gmail.com")})}
    catch(error){console.error("無法檢查諮詢單編輯紀錄",error);return NextResponse.json({ok:true,teacherEdited:false,checkUnavailable:true})}
  }
  if (action === "generate_document") {
    const db=adminSupabase(),{data:booking,error}=await db.from("bookings").select("id,booking_no,data_submitted_at").eq("booking_no",bookingNo).single();
    if(error||!booking)return NextResponse.json({error:"找不到訂單"},{status:404});
    if(!booking.data_submitted_at)return NextResponse.json({error:"用戶尚未回傳問事資料，不能建立諮詢單"},{status:400});
    try{
      await createConsultationDocuments(db,booking.id,booking.booking_no,Boolean(body.force),body.createMode==="new"?"new":"replace");
      const {data:details}=await db.from("booking_details").select("id,item_title,google_document_url").eq("booking_id",booking.id).not("google_document_url","is",null);
      if(!details?.length)return NextResponse.json({error:"這筆訂單沒有可建立的問事資料"},{status:400});
      return NextResponse.json({ok:true,documents:details});
    }catch(error){
      console.error("後台建立諮詢文件失敗",error);
      return NextResponse.json({error:error instanceof Error?error.message:"建立文件失敗"},{status:500});
    }
  }
  if (action === "change_document_link") {
    const url=String(body.documentUrl||"").trim(),match=url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if(!match)return NextResponse.json({error:"請貼上正確的 Google 文件連結"},{status:400});
    const db=adminSupabase(),{data:booking,error}=await db.from("bookings").select("id").eq("booking_no",bookingNo).single();
    if(error||!booking)return NextResponse.json({error:"找不到訂單"},{status:404});
    const {data:details,error:detailError}=await db.from("booking_details").select("id,item_title,google_document_created_at,booking_items(code)").eq("booking_id",booking.id);
    if(detailError)return NextResponse.json({error:detailError.message},{status:400});
    const target=(details||[]).find((detail:any)=>{const item=Array.isArray(detail.booking_items)?detail.booking_items[0]:detail.booking_items;return item?.code==="past-life-personal"||String(detail.item_title||"").includes("前世因果（個人）")});
    if(!target)return NextResponse.json({error:"這筆訂單沒有可連結的前世因果（個人）項目"},{status:400});
    const normalized=`https://docs.google.com/document/d/${match[1]}/edit`,{error:updateError}=await db.from("booking_details").update({google_document_id:match[1],google_document_url:normalized,google_document_created_at:target.google_document_created_at||new Date().toISOString()}).eq("id",target.id);
    return updateError?NextResponse.json({error:updateError.message},{status:400}):NextResponse.json({ok:true,url:normalized});
  }
  if (action === "get_answer") {
    if (!body.answerId) return NextResponse.json({ error: "缺少問事資料" }, { status: 400 });
    const db = adminSupabase(), { data: answer, error } = await db.from("booking_consultation_answers")
      .select("id,profile_id,questions,extra_data,updated_at,booking_answer_participants(position,profile_id)")
      .eq("id", body.answerId).single();
    if (error || !answer) return NextResponse.json({ error: error?.message || "找不到問事資料" }, { status: 404 });
    return NextResponse.json({ answer });
  }
  if (action === "update_answer") {
    if(!body.answerId||!body.profileId)return NextResponse.json({error:"缺少問事資料"},{status:400});
    const db=adminSupabase(),{error}=await db.from("booking_consultation_answers").update({profile_id:body.profileId,questions:(body.questions||[]).slice(0,3),extra_data:body.extraData||{},updated_at:new Date().toISOString()}).eq("id",body.answerId);
    if(!error&&Array.isArray(body.profileIds)){await db.from("booking_answer_participants").delete().eq("answer_id",body.answerId);const rows=body.profileIds.filter(Boolean).filter((id:string,i:number,a:string[])=>a.indexOf(id)===i).map((profile_id:string,position:number)=>({answer_id:body.answerId,profile_id,position}));if(rows.length)await db.from("booking_answer_participants").insert(rows)}
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if (action === "update_consultation_profile") {
    const db=adminSupabase(),allowed=["name","relationship_detail","gender","birth_date","lunar_birth_text","zodiac","birth_shichen","address","death_date","lunar_death_text","death_shichen","notes","owner_profile_id","photo_data"];
    if (!body?.profileId) return NextResponse.json({error:"缺少資料"},{status:400});
    const profileUpdate=Object.fromEntries(allowed.filter(k=>k in body.profile).map(k=>[k,body.profile[k]||null]));
    const {error}=await db.from("consultation_profiles").update({...profileUpdate,updated_at:new Date().toISOString()}).eq("id",body.profileId);
    if(body.answerId)await db.from("booking_consultation_answers").update({questions:(body.questions||[]).slice(0,3),updated_at:new Date().toISOString()}).eq("id",body.answerId);
    return error?NextResponse.json({error:error.message},{status:400}):NextResponse.json({ok:true});
  }
  if (action === "update_price") {
    const amount=Number(body.totalPrice);
    if(!Number.isInteger(amount)||amount<0||amount>10000000)return NextResponse.json({error:"請輸入正確的整數金額"},{status:400});
    const db=adminSupabase(),{data:booking,error:findError}=await db.from("bookings").select("id,booking_no,total_price,slot_start,expires_at,payment_status,status,customers(line_user_id),consultation_methods(code),booking_details(item_title,quantity,booking_detail_sub_items(sub_item_title))").eq("booking_no",bookingNo).single();
    if(findError||!booking)return NextResponse.json({error:findError?.message||"找不到訂單"},{status:404});
    if(booking.payment_status==="paid")return NextResponse.json({error:"已付款訂單不能修改金額"},{status:400});
    if(booking.status==="cancelled"||booking.status==="expired")return NextResponse.json({error:"已取消或已失效訂單不能修改金額"},{status:400});
    const {data,error}=await db.from("bookings").update({total_price:amount,updated_at:new Date().toISOString()}).eq("id",booking.id).neq("payment_status","paid").select("booking_no,total_price").single();
    if(error||!data)return NextResponse.json({error:error?.message||"訂單狀態已變更，請重新載入"},{status:400});
    const customer=Array.isArray(booking.customers)?booking.customers[0]:booking.customers,
      method=Array.isArray(booking.consultation_methods)?booking.consultation_methods[0]:booking.consultation_methods,
      details=Array.isArray(booking.booking_details)?booking.booking_details:[],
      itemTitles=details.flatMap((detail:any)=>{
        const subs=Array.isArray(detail.booking_detail_sub_items)?detail.booking_detail_sub_items:[];
        const title=[detail.item_title,subs.map((sub:any)=>sub.sub_item_title).filter(Boolean).join("、")].filter(Boolean).join("｜");
        return Array.from({length:Math.max(1,Number(detail.quantity)||1)},()=>title);
      }).filter(Boolean),
      site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
    if(customer?.line_user_id)try{await pushLineFlex(customer.line_user_id,"訂單已更新",bookingStatusFlex({status:"pending",headerLabel:"訂單已更新",bookingNo:booking.booking_no,method:method?.code||"text",total:amount,slotStart:booking.slot_start||undefined,items:itemTitles,expiresAt:booking.expires_at||undefined,site}))}catch(lineError){console.error("訂單改價 LINE 通知失敗",lineError)}
    return NextResponse.json({ok:true,totalPrice:data.total_price});
  }
  if (action !== "mark_paid") return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  const db = adminSupabase();
  const { data: current, error: currentError } = await db.from("bookings").select(
    "id,booking_no,total_price,slot_start,payment_status,customers(line_user_id),consultation_methods(code),booking_details(item_title,quantity,booking_detail_sub_items(sub_item_title))",
  ).eq("booking_no", bookingNo).single();
  if (currentError || !current)
    return NextResponse.json({ error: currentError?.message || "找不到訂單" }, { status: 404 });
  if (current.payment_status === "paid")
    return NextResponse.json({ error: "這筆訂單已是已付款狀態" }, { status: 400 });
  const { data, error } = await db.from("bookings").update({
    payment_status: "paid",
    status: "confirmed",
    collection_source: "manual",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("booking_no", bookingNo).neq("payment_status", "paid").select("booking_no").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "找不到訂單" }, { status: 400 });
  const customer = Array.isArray(current.customers) ? current.customers[0] : current.customers;
  const method = Array.isArray(current.consultation_methods) ? current.consultation_methods[0] : current.consultation_methods;
  const details = Array.isArray(current.booking_details) ? current.booking_details : [];
  const items = details.flatMap((detail: any) => {
    const subs = Array.isArray(detail.booking_detail_sub_items) ? detail.booking_detail_sub_items : [];
    const title = [detail.item_title, subs.map((sub: any) => sub.sub_item_title).filter(Boolean).join("、")].filter(Boolean).join("｜");
    return Array.from({ length: Math.max(1, Number(detail.quantity) || 1) }, () => title);
  }).filter(Boolean);
  let lineNotified = false;
  let lineError = "";
  if (customer?.line_user_id) {
    try {
      const site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
      await pushLineFlex(customer.line_user_id, "已付款｜請填寫問事資料", bookingStatusFlex({
        status: "paid",
        bookingNo: current.booking_no,
        method: method?.code || "text",
        total: Number(current.total_price || 0),
        slotStart: current.slot_start || undefined,
        items,
        site,
      }));
      lineNotified = true;
    } catch (notifyError) {
      lineError = notifyError instanceof Error ? notifyError.message : "LINE 通知失敗";
      console.error("手動收款 LINE 通知失敗", notifyError);
    }
  } else lineError = "此用戶沒有 LINE UID，無法傳送通知";
  return NextResponse.json({ ok: true, lineNotified, lineError });
}
export async function PATCH(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(),
    db = adminSupabase(),
    { data: b } = await db
      .from("bookings")
      .select(
        "id,booking_no,slot_start,consultation_method_id,customers(line_user_id),consultation_methods(code,base_price),booking_details(item_id,quantity,booking_detail_sub_items(sub_item_id))",
      )
      .eq("booking_no", body.bookingNo)
      .single();
  if (!b) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
  const oldSlotStart = b.slot_start,
    normalizeLines = (lines: any[]) =>
      lines
        .map((line: any) =>
          `${line.itemId || line.item_id}|${line.subId || line.booking_detail_sub_items?.[0]?.sub_item_id || ""}|${Math.max(1, Number(line.qty ?? line.quantity) || 1)}`,
        )
        .sort(),
    timeChanged = Boolean(
      body.slotStart &&
        (!oldSlotStart ||
          new Date(body.slotStart).getTime() !== new Date(oldSlotStart).getTime()),
    ),
    itemsChanged =
      Array.isArray(body.lines) &&
      JSON.stringify(normalizeLines(body.lines)) !==
        JSON.stringify(normalizeLines(b.booking_details || []));
  if (body.slotStart) {
    const start = new Date(body.slotStart),
      end = new Date(start.getTime() + 1800000);
    await db
      .from("bookings")
      .update({
        slot_start: start.toISOString(),
        slot_end: end.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", b.id);
  }
  let titles: string[] = [];
  if (Array.isArray(body.lines) && body.lines.length) {
    const itemIds = body.lines.map((x: { itemId: string }) => x.itemId),
      subIds = body.lines
        .map((x: { subId?: string }) => x.subId)
        .filter(Boolean);
    const { data: items } = await db
      .from("booking_items")
      .select("id,title,price")
      .in("id", itemIds)
      .eq("is_active", true);
    const { subItems } = await (async () => {
      const { data } = subIds.length
        ? await db
            .from("sub_items")
            .select("id,item_id,title,price")
            .in("id", subIds)
        : { data: [] };
      return { subItems: data || [] };
    })();
    await db.from("booking_details").delete().eq("booking_id", b.id);
    if (items?.length) {
      let subtotal = 0;
      for (const line of body.lines as {
        itemId: string;
        subId?: string;
        qty: number;
      }[]) {
        const item = items.find((i) => i.id === line.itemId);
        if (!item) continue;
        const sub = subItems.find(
            (s) => s.id === line.subId && s.item_id === item.id,
          ),
          qty = Math.max(1, Number(line.qty) || 1),
          unit = sub?.price ?? item.price;
        const { data: detail } = await db
          .from("booking_details")
          .insert({
            booking_id: b.id,
            item_id: item.id,
            item_title: item.title,
            unit_price: unit,
            quantity: qty,
            line_total: unit * qty,
          })
          .select("id")
          .single();
        if (sub && detail)
          await db.from("booking_detail_sub_items").insert({
            booking_detail_id: detail.id,
            sub_item_id: sub.id,
            sub_item_title: sub.title,
            unit_price: sub.price,
            quantity: qty,
            line_total: sub.price * qty,
          });
        subtotal += unit * qty;
        titles.push(`${sub?.title || item.title} x${qty}`);
      }
      const method = b.consultation_methods as unknown as {
        base_price: number;
      };
      await db
        .from("bookings")
        .update({
          subtotal,
          total_price: subtotal + (method.base_price || 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", b.id);
    }
  }
  const { data: currentDetails } = await db
    .from("booking_details")
    .select("item_title,quantity,booking_detail_sub_items(sub_item_title)")
    .eq("booking_id", b.id);
  titles = (currentDetails || []).map((detail: any) => {
    const subTitle = detail.booking_detail_sub_items?.[0]?.sub_item_title || "";
    return [detail.item_title, subTitle].filter(Boolean).join("｜");
  });
  titles = titles.map((title) =>
    title
      .replace(/(兩位嬰靈[（(]含[）)]以上).*/u, "$1")
      .replace(/[（(]?無論幾位[^）)]*[）)]?/g, "")
      .replace(/^＋加購[：:]\s*/u, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const c = b.customers as unknown as { line_user_id: string },
    site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
    effectiveSlot = body.slotStart || oldSlotStart,
    isVideo = (b.consultation_methods as unknown as { code: string })?.code === "video",
    slotDate = effectiveSlot ? new Date(effectiveSlot) : null,
    dateParts = slotDate ? new Intl.DateTimeFormat("zh-TW", {
      timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short",
    }).formatToParts(slotDate) : [],
    datePart = (type: string) => dateParts.find((part) => part.type === type)?.value || "",
    videoDate = slotDate ? `${datePart("month")}月${datePart("day")}日（${datePart("weekday").replace("週", "")}）` : "",
    timeParts = slotDate ? new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(slotDate) : [],
    hour24 = Number(timeParts.find((part) => part.type === "hour")?.value || 0),
    minute = timeParts.find((part) => part.type === "minute")?.value || "00",
    videoTime = `${hour24 < 12 ? "上午" : hour24 < 13 ? "中午" : "下午"} ${String(hour24 % 12 || 12).padStart(2, "0")}:${minute}`;
  await pushLineFlex(c.line_user_id,"預約已變更",bookingStatusFlex({status:"changed",bookingNo:b.booking_no,method:isVideo?"video":"text",slotStart:effectiveSlot||undefined,items:titles,site}));
  /* legacy layout
  await pushLineFlex(c.line_user_id, "預約已變更", {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#F1F1F1",
      contents: [
        {
          type: "text",
          text: "預約已變更",
          color: "#333333",
          weight: "bold",
          size: "xl",
          align: "center",
        },
        {
          type: "text",
          text: `訂單編號：${b.booking_no}`,
          color: "#8B8B8B",
          size: "xs",
          align: "center",
          margin: "sm",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        ...(isVideo
          ? [
              {
                type: "text",
                text: "視訊諮詢",
                align: "center",
                weight: "bold",
                size: "lg",
              },
              { type: "separator", margin: "md" },
              {
                type: "text",
                text: "預約時間",
                color: "#333333",
                size: "sm",
                margin: "lg",
              },
              {
                type: "text",
                text: videoDate,
                wrap: true,
                color: "#218548",
                weight: "bold",
                size: "xxl",
              },
              {
                type: "text",
                text: videoTime,
                wrap: true,
                color: "#218548",
                weight: "bold",
                size: "xxl",
              },
            ]
          : []),
        {
          type: "text",
          text: `${isVideo ? "諮詢項目\n" : "諮詢項目\n"}${titles.map((title, index) => `${["❶","❷","❸","❹","❺","❻","❼","❽","❾"][index] || `${index + 1}.`}${title}`).join("\n")}`,
          wrap: true,
          margin: "lg",
          color: "#333333",
          size: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#4A78C2",
          height: "md",
          action: {
            type: "uri",
            label: "查看預約",
            uri: `${site}/my-bookings?order=${encodeURIComponent(b.booking_no)}`,
          },
        },
      ],
    },
  }); */
  return NextResponse.json({ ok: true });
}
