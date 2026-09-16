import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { getQuickConsultationReplyFromDocument, normalizeConsultationReturnText, upsertQuickConsultationReply } from "@/lib/google-consultation-docs";

const one = (value:any) => Array.isArray(value) ? value[0] : value;
const asArray = (value:any):any[] => Array.isArray(value) ? value : value ? [value] : [];

async function context(bookingNo:string, requestedDocumentId="") {
  const db=adminSupabase();
  const {data:booking,error}=await db.from("bookings").select(`
    id,booking_no,customers(line_display_name,full_name),
    booking_details(id,item_title,google_document_id,google_document_url,
      booking_consultation_answers(questions,extra_data))
  `).eq("booking_no",bookingNo).single();
  if(error||!booking)throw new Error("找不到這筆預約");
  const details=asArray(booking.booking_details);
  const documentDetail=details.find((detail:any)=>detail.google_document_id===requestedDocumentId)||details.find((detail:any)=>detail.google_document_id);
  if(!documentDetail?.google_document_id)throw new Error("這筆預約尚未建立 Google 諮詢單");
  const questions=details.flatMap((detail:any)=>asArray(detail.booking_consultation_answers).flatMap((answer:any)=>asArray(answer.questions)))
    .map((question:any)=>String(question||"").trim()).filter(Boolean);
  const {data:topics,error:topicError}=await db.from("quick_reply_topics")
    .select("id,code,title,icon,keywords,sort_order,quick_reply_options(id,code,label,sort_order,is_active)")
    .eq("is_active",true).order("sort_order",{ascending:true});
  if(topicError)throw new Error(topicError.message.includes("quick_reply_topics")?"尚未建立快速諮詢回覆資料表，請先執行本次提供的 Supabase SQL":topicError.message);
  const normalizedTopics=(topics||[]).map((topic:any)=>({...topic,options:asArray(topic.quick_reply_options).filter((option:any)=>option.is_active).sort((a:any,b:any)=>a.sort_order-b.sort_order)}));
  const joinedQuestions=questions.join("\n").toLocaleLowerCase("zh-TW");
  const recommended=normalizedTopics.filter((topic:any)=>asArray(topic.keywords).some((keyword:string)=>joinedQuestions.includes(String(keyword).toLocaleLowerCase("zh-TW")))).map((topic:any)=>topic.code);
  const {data:saved,error:savedError}=await db.from("booking_quick_replies").select("recommended_topic_codes,selections,phrase_ids,final_answer,updated_at,google_document_id,google_document_url").eq("booking_id",booking.id).maybeSingle();
  if(savedError)throw new Error(savedError.message);
  let documentAnswer="";
  try{documentAnswer=await getQuickConsultationReplyFromDocument(documentDetail.google_document_id)}catch(error){console.error("讀取 Google 文件阿嫂回答失敗",error)}
  return {db,booking,customer:one(booking.customers)||{},documentDetail,questions,topics:normalizedTopics,recommended,saved,documentAnswer};
}

function pick<T extends {id:string}>(values:T[],previous:Set<string>){
  const alternatives=values.filter(value=>!previous.has(value.id));
  const pool=alternatives.length?alternatives:values;
  return pool.length?pool[Math.floor(Math.random()*pool.length)]:null;
}

export async function GET(request:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
  try{
    const bookingNo=request.nextUrl.searchParams.get("bookingNo")||"",documentId=request.nextUrl.searchParams.get("documentId")||"";
    const data=await context(bookingNo,documentId);
    return NextResponse.json({ok:true,bookingNo:data.booking.booking_no,customerName:data.customer.full_name||data.customer.line_display_name||"LINE 用戶",questions:data.questions,topics:data.topics,recommendedTopicCodes:data.saved?.recommended_topic_codes?.length?data.saved.recommended_topic_codes:data.recommended,selections:data.saved?.selections||{},phraseIds:data.saved?.phrase_ids||[],finalAnswer:data.saved?.final_answer||data.documentAnswer||"",updatedAt:data.saved?.updated_at||null,documentId:data.documentDetail.google_document_id,documentUrl:data.documentDetail.google_document_url||`https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"讀取快速回覆失敗"},{status:400})}
}

export async function POST(request:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
  try{
    const body=await request.json(),data=await context(String(body.bookingNo||""),String(body.documentId||""));
    const selections=body.selections&&typeof body.selections==="object"?body.selections:{};
    const validSelections:{topicCode:string;optionId:string}[]=[];
    for(const [topicCode,optionCode] of Object.entries(selections)){
      const topic=data.topics.find((entry:any)=>entry.code===topicCode),option=topic?.options.find((entry:any)=>entry.code===optionCode);
      if(option)validSelections.push({topicCode,optionId:option.id});
    }
    if(!validSelections.length)return NextResponse.json({error:"請至少選擇一個判斷結果"},{status:400});
    const previous=new Set(asArray(body.previousPhraseIds).map(String));
    let finalAnswer=normalizeConsultationReturnText(String(body.finalAnswer||"")),phraseIds:string[]=asArray(body.phraseIds).map(String);
    if(body.mode!=="write"){
      const optionIds=validSelections.map(entry=>entry.optionId);
      const {data:phrases,error}=await data.db.from("quick_reply_phrases").select("id,option_id,phrase_type,content").eq("is_active",true).or(`option_id.is.null,option_id.in.(${optionIds.join(",")})`);
      if(error)throw new Error(error.message);
      const all=phrases||[],chosen:any[]=[];
      const opening=pick(all.filter((entry:any)=>!entry.option_id&&entry.phrase_type==="opening"),previous);if(opening)chosen.push(opening);
      for(const selection of validSelections){const sentence=pick(all.filter((entry:any)=>entry.option_id===selection.optionId&&entry.phrase_type==="judgment"),previous);if(sentence)chosen.push(sentence)}
      const advice=pick(all.filter((entry:any)=>!entry.option_id&&entry.phrase_type==="advice"),previous);if(advice)chosen.push(advice);
      const closing=pick(all.filter((entry:any)=>!entry.option_id&&entry.phrase_type==="closing"),previous);if(closing)chosen.push(closing);
      finalAnswer=chosen.map(entry=>String(entry.content).trim()).filter(Boolean).join("");phraseIds=chosen.map(entry=>entry.id);
    }
    if(!finalAnswer)return NextResponse.json({error:"目前句庫沒有可用內容"},{status:400});
    const record={booking_id:data.booking.id,recommended_topic_codes:data.recommended,selections,phrase_ids:phraseIds,final_answer:finalAnswer,google_document_id:data.documentDetail.google_document_id,google_document_url:data.documentDetail.google_document_url||`https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`,updated_at:new Date().toISOString()};
    const {error:saveError}=await data.db.from("booking_quick_replies").upsert(record,{onConflict:"booking_id"});
    if(saveError)throw new Error(saveError.message);
    if(body.mode==="write")await upsertQuickConsultationReply(data.documentDetail.google_document_id,finalAnswer);
    return NextResponse.json({ok:true,finalAnswer,phraseIds,written:body.mode==="write",updatedAt:record.updated_at});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"快速回覆處理失敗"},{status:400})}
}

