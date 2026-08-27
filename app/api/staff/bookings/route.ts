import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { pushLineFlex } from "@/lib/line-message";
import { createConsultationDocuments, wasDocumentEditedBy } from "@/lib/google-consultation-docs";
export async function GET() {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { data, error } = await adminSupabase()
    .from("bookings")
    .select(
      "id,booking_no,slot_start,total_price,payment_method,payment_status,collection_source,data_submitted_at,status,cancellation_reason,paid_at,created_at,customers(id,line_user_id,line_display_name,line_picture_url,full_name,gender,full_address,birth_date,lunar_birth_text,zodiac,birth_shichen),consultation_methods(id,code,title,base_price),booking_details(id,item_id,item_title,quantity,google_document_id,google_document_url,google_document_created_at,google_sheet_url,booking_items(code),booking_detail_sub_items(sub_item_id,sub_item_title),booking_detail_profiles(profile_id,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data)),booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data),booking_answer_participants(position,consultation_profiles(id,profile_type,relationship,relationship_detail,name,gender,birth_date,lunar_birth_text,zodiac,birth_shichen,address,death_date,lunar_death_text,death_shichen,notes,owner_profile_id,photo_data))))",
    )
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ bookings: data });
}
export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(), { bookingNo, action } = body;
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
    const db=adminSupabase(),{data:booking,error:findError}=await db.from("bookings").select("id,booking_no,payment_status,status,customers(line_user_id)").eq("booking_no",bookingNo).single();
    if(findError||!booking)return NextResponse.json({error:findError?.message||"找不到訂單"},{status:404});
    if(booking.payment_status==="paid")return NextResponse.json({error:"已付款訂單不能修改金額"},{status:400});
    if(booking.status==="cancelled"||booking.status==="expired")return NextResponse.json({error:"已取消或已失效訂單不能修改金額"},{status:400});
    const {data,error}=await db.from("bookings").update({total_price:amount,updated_at:new Date().toISOString()}).eq("id",booking.id).neq("payment_status","paid").select("booking_no,total_price").single();
    if(error||!data)return NextResponse.json({error:error?.message||"訂單狀態已變更，請重新載入"},{status:400});
    const customer=Array.isArray(booking.customers)?booking.customers[0]:booking.customers,site=process.env.NEXT_PUBLIC_SITE_URL||request.nextUrl.origin;
    if(customer?.line_user_id)try{await pushLineFlex(customer.line_user_id,"訂單金額已更新",{type:"bubble",header:{type:"box",layout:"vertical",backgroundColor:"#F4EBDD",contents:[{type:"text",text:"訂單已更新",weight:"bold",size:"xl",color:"#8A3045",align:"center"},{type:"text",text:"林阿嫂線上諮詢",size:"sm",color:"#777777",align:"center",margin:"sm"}]},body:{type:"box",layout:"vertical",spacing:"md",contents:[{type:"text",text:"訂單編號："+booking.booking_no,wrap:true},{type:"text",text:"更新後金額：NT$ "+amount.toLocaleString("zh-TW"),weight:"bold",color:"#8A3045",size:"lg"},{type:"text",text:"訂單金額已由工作人員更新，請點選下方按鈕繼續完成付款。",wrap:true,color:"#555555"}]},footer:{type:"box",layout:"vertical",contents:[{type:"button",style:"primary",height:"md",color:"#8A3045",action:{type:"uri",label:"繼續付款",uri:site+"/pay?order="+encodeURIComponent(booking.booking_no)}}]}})}catch(lineError){console.error("訂單改價 LINE 通知失敗",lineError)}
    return NextResponse.json({ok:true,totalPrice:data.total_price});
  }
  if (action !== "mark_paid") return NextResponse.json({ error: "不支援的操作" }, { status: 400 });
  const db = adminSupabase();
  const { data, error } = await db.from("bookings").update({
    payment_status: "paid",
    status: "confirmed",
    collection_source: "manual",
    paid_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("booking_no", bookingNo).neq("status", "cancelled").select("booking_no").single();
  if (error || !data) return NextResponse.json({ error: error?.message || "找不到訂單" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
export async function PATCH(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const body = await request.json(),
    db = adminSupabase(),
    { data: b } = await db
      .from("bookings")
      .select(
        "id,booking_no,consultation_method_id,customers(line_user_id),consultation_methods(code,base_price)",
      )
      .eq("booking_no", body.bookingNo)
      .single();
  if (!b) return NextResponse.json({ error: "找不到訂單" }, { status: 404 });
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
  if (!titles.length) {
    const { data: d } = await db
      .from("booking_details")
      .select("item_title")
      .eq("booking_id", b.id);
    titles = (d || []).map((x) => x.item_title);
  }
  const c = b.customers as unknown as { line_user_id: string },
    site = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin,
    time = body.slotStart
      ? new Date(body.slotStart).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
        })
      : "文字諮詢";
  await pushLineFlex(c.line_user_id, "預約已變更", {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#8A3045",
      contents: [
        {
          type: "text",
          text: "預約已變更",
          color: "#FFFFFF",
          weight: "bold",
          size: "xl",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `訂單編號：${b.booking_no}`,
          wrap: true,
          weight: "bold",
        },
        { type: "text", text: `變更後時間：${time}`, wrap: true },
        { type: "text", text: `變更後項目：${titles.join("、")}`, wrap: true },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#8A3045",
          action: {
            type: "uri",
            label: "查看預約",
            uri: `${site}/my-bookings?order=${encodeURIComponent(b.booking_no)}`,
          },
        },
      ],
    },
  });
  return NextResponse.json({ ok: true });
}
