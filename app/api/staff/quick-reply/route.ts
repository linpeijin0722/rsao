import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";
import { adminSupabase } from "@/lib/supabase";
import { getQuickReplyQuestionSlots, normalizeConsultationReturnText, upsertQuickConsultationQuestionReplies } from "@/lib/google-consultation-docs";

const one=(value:any)=>Array.isArray(value)?value[0]:value;
const asArray=(value:any):any[]=>Array.isArray(value)?value:value?[value]:[];

async function context(bookingNo:string,requestedDocumentId=""){
  const db=adminSupabase();
  const {data:booking,error}=await db.from("bookings").select("id,booking_no,customers(line_display_name,full_name),booking_details(id,created_at,item_title,google_document_id,google_document_url,booking_items(code),booking_consultation_answers(questions))").eq("booking_no",bookingNo).single();
  if(error||!booking)throw new Error("找不到這筆預約");
  const details=asArray(booking.booking_details).sort((a:any,b:any)=>String(a.created_at).localeCompare(String(b.created_at)));
  const documentDetail=details.find((detail:any)=>detail.google_document_id===requestedDocumentId)||details.find((detail:any)=>detail.google_document_id);
  if(!documentDetail?.google_document_id)throw new Error("這筆預約尚未建立 Google 諮詢單");
  const questionMeta=details.flatMap((detail:any)=>asArray(detail.booking_consultation_answers).flatMap((answer:any)=>asArray(answer.questions).map((question:any)=>({question:String(question||"").trim(),itemCode:one(detail.booking_items)?.code||"",itemTitle:detail.item_title||""})))).filter((entry:any)=>entry.question);
  let questionSlots=(await getQuickReplyQuestionSlots(documentDetail.google_document_id)).map((slot,index)=>({...slot,itemCode:questionMeta[index]?.itemCode||"",itemTitle:questionMeta[index]?.itemTitle||"",manualOnly:String(questionMeta[index]?.itemCode||"").startsWith("past-life-")}));
  if(!questionSlots.length){
    const fallback=details.flatMap((detail:any)=>asArray(detail.booking_consultation_answers).flatMap((answer:any)=>asArray(answer.questions))).map((question:any)=>String(question||"").trim()).filter(Boolean);
    questionSlots=fallback.map((question:string,slotIndex:number)=>({slotIndex,questionNumber:slotIndex+1,question,answer:"",itemCode:questionMeta[slotIndex]?.itemCode||"",itemTitle:questionMeta[slotIndex]?.itemTitle||"",manualOnly:String(questionMeta[slotIndex]?.itemCode||"").startsWith("past-life-")}));
  }
  const {data:topics,error:topicError}=await db.from("quick_reply_topics").select("id,code,title,icon,keywords,sort_order,quick_reply_options(id,code,label,sort_order,is_active)").eq("is_active",true).order("sort_order",{ascending:true});
  if(topicError)throw new Error(topicError.message.includes("quick_reply_topics")?"尚未建立快速諮詢回覆資料表，請先執行本次提供的 Supabase SQL":topicError.message);
  const normalizedTopics=(topics||[]).map((topic:any)=>({...topic,options:asArray(topic.quick_reply_options).filter((option:any)=>option.is_active).sort((a:any,b:any)=>a.sort_order-b.sort_order)}));
  const itemTopic:Record<string,string>={"infant-spirit":"infant_spirit","deceased-relative":"deceased","spiritual-interference":"spiritual","home-energy":"home","personal-romance":"love","marriage-bazi":"love","health":"health","lawsuit-benefactor":"lawsuit","naming":"naming_result","date-time-selection":"date_result"};
  const recommendedByQuestion=Object.fromEntries(questionSlots.map(slot=>{const fromItem=itemTopic[slot.itemCode],fromWords=normalizedTopics.filter((topic:any)=>asArray(topic.keywords).some((keyword:string)=>slot.question.toLocaleLowerCase("zh-TW").includes(String(keyword).toLocaleLowerCase("zh-TW")))).map((topic:any)=>topic.code);return [String(slot.slotIndex),slot.manualOnly?[]:Array.from(new Set([fromItem,...fromWords].filter(Boolean)))]}));
  const {data:saved,error:savedError}=await db.from("booking_quick_replies").select("question_replies,updated_at").eq("booking_id",booking.id).maybeSingle();
  if(savedError)throw new Error(savedError.message.includes("question_replies")?"請先執行新版快速諮詢回覆 Supabase SQL":savedError.message);
  const savedReplies=saved?.question_replies&&typeof saved.question_replies==="object"?saved.question_replies:{};
  const questionReplies=Object.fromEntries(questionSlots.map(slot=>{const existing=savedReplies[String(slot.slotIndex)]||{};return [String(slot.slotIndex),{selections:existing.selections||{},phraseIds:existing.phraseIds||[],answer:existing.answer||slot.answer||"",completed:existing.completed===true}]}));
  return {db,booking,customer:one(booking.customers)||{},documentDetail,questionSlots,topics:normalizedTopics,recommendedByQuestion,questionReplies,updatedAt:saved?.updated_at||null};
}

function pick<T extends {id:string}>(values:T[],previous:Set<string>){const alternatives=values.filter(value=>!previous.has(value.id)),pool=alternatives.length?alternatives:values;return pool.length?pool[Math.floor(Math.random()*pool.length)]:null}

export async function GET(request:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
  try{const data=await context(request.nextUrl.searchParams.get("bookingNo")||"",request.nextUrl.searchParams.get("documentId")||"");return NextResponse.json({ok:true,bookingNo:data.booking.booking_no,customerName:data.customer.full_name||data.customer.line_display_name||"LINE 用戶",questions:data.questionSlots,topics:data.topics,recommendedByQuestion:data.recommendedByQuestion,questionReplies:data.questionReplies,updatedAt:data.updatedAt,documentId:data.documentDetail.google_document_id,documentUrl:data.documentDetail.google_document_url||`https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"讀取快速回覆失敗"},{status:400})}
}

export async function POST(request:NextRequest){
  if(!isAdminSession((await cookies()).get("admin_session")?.value))return NextResponse.json({error:"未登入"},{status:401});
  try{
    const body=await request.json(),data=await context(String(body.bookingNo||""),String(body.documentId||""));
    if(body.mode==="compose"){
      const selections=body.selections&&typeof body.selections==="object"?body.selections:{},valid:{topicCode:string;optionId:string}[]=[];
      for(const [topicCode,optionCode] of Object.entries(selections)){const topic=data.topics.find((entry:any)=>entry.code===topicCode),option=topic?.options.find((entry:any)=>entry.code===optionCode);if(option)valid.push({topicCode,optionId:option.id})}
      if(!valid.length)return NextResponse.json({error:"請先選擇這個問題的判斷結果"},{status:400});
      const optionIds=valid.map(entry=>entry.optionId),previous=new Set(asArray(body.previousPhraseIds).map(String));
      const {data:phrases,error}=await data.db.from("quick_reply_phrases").select("id,option_id,content").eq("is_active",true).eq("phrase_type","judgment").in("option_id",optionIds);
      if(error)throw new Error(error.message);
      const chosen=valid.map(selection=>pick((phrases||[]).filter((entry:any)=>entry.option_id===selection.optionId),previous)).filter(Boolean) as any[];
      const answer=chosen.map(entry=>String(entry.content).trim()).filter(Boolean).join(" ");
      if(!answer)return NextResponse.json({error:"這些選項目前沒有可用句子"},{status:400});
      return NextResponse.json({ok:true,answer,phraseIds:chosen.map(entry=>entry.id)});
    }
    if(body.mode!=="write")return NextResponse.json({error:"不支援的操作"},{status:400});
    const incoming=body.questionReplies&&typeof body.questionReplies==="object"?body.questionReplies:{},questionReplies:Record<string,any>={},answers:Record<string,string>={};
    for(const slot of data.questionSlots){const row=incoming[String(slot.slotIndex)]||{},answer=normalizeConsultationReturnText(String(row.answer||""));if(!answer)continue;questionReplies[String(slot.slotIndex)]={selections:row.selections||{},phraseIds:asArray(row.phraseIds).map(String),answer,completed:row.completed===true};answers[String(slot.slotIndex)]=answer}
    if(!Object.keys(answers).length)return NextResponse.json({error:"至少要完成一題回答"},{status:400});
    const recommended=Array.from(new Set(Object.values(data.recommendedByQuestion).flat())) as string[],phraseIds=Object.values(questionReplies).flatMap((row:any)=>row.phraseIds),finalAnswer=Object.entries(questionReplies).map(([index,row]:any)=>`A${data.questionSlots[Number(index)]?.questionNumber||Number(index)+1}:${row.answer}`).join("\n");
    const record={booking_id:data.booking.id,recommended_topic_codes:recommended,selections:Object.fromEntries(Object.entries(questionReplies).map(([key,row]:any)=>[key,row.selections])),phrase_ids:phraseIds,final_answer:finalAnswer,question_replies:questionReplies,phrase_usage:Object.fromEntries(Object.entries(questionReplies).map(([key,row]:any)=>[key,row.phraseIds])),google_document_id:data.documentDetail.google_document_id,google_document_url:data.documentDetail.google_document_url||`https://docs.google.com/document/d/${data.documentDetail.google_document_id}/edit`,updated_at:new Date().toISOString()};
    const {error:saveError}=await data.db.from("booking_quick_replies").upsert(record,{onConflict:"booking_id"});if(saveError)throw new Error(saveError.message);
    await upsertQuickConsultationQuestionReplies(data.documentDetail.google_document_id,answers);
    return NextResponse.json({ok:true,written:true,updatedAt:record.updated_at});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"快速回覆處理失敗"},{status:400})}
}
