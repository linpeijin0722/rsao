"use client";
import { useEffect, useMemo, useState } from "react";

type Topic={code:string;title:string;icon:string;options:{code:string;label:string}[]};
type ReplyData={bookingNo:string;customerName:string;questions:string[];topics:Topic[];recommendedTopicCodes:string[];selections:Record<string,string>;phraseIds:string[];finalAnswer:string;documentId:string;documentUrl:string;updatedAt:string|null};

export default function QuickConsultationReply({bookingNo,documentId,onClose}:{bookingNo:string;documentId:string;onClose:()=>void}){
  const [data,setData]=useState<ReplyData|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[activeTopics,setActiveTopics]=useState<string[]>([]),[selections,setSelections]=useState<Record<string,string>>({}),[answer,setAnswer]=useState(""),[phraseIds,setPhraseIds]=useState<string[]>([]),[busy,setBusy]=useState(false),[written,setWritten]=useState(false),[editing,setEditing]=useState(false),[addOpen,setAddOpen]=useState(false);
  useEffect(()=>{fetch(`/api/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||"讀取失敗");setData(result);setSelections(result.selections||{});setPhraseIds(result.phraseIds||[]);setAnswer(result.finalAnswer||"");setActiveTopics(Array.from(new Set([...(result.recommendedTopicCodes||[]),...Object.keys(result.selections||{})])))}).catch(err=>setError(err instanceof Error?err.message:"讀取失敗")).finally(()=>setLoading(false))},[bookingNo,documentId]);
  const topicMap=useMemo(()=>new Map((data?.topics||[]).map(topic=>[topic.code,topic])),[data]);
  const visibleTopics=activeTopics.map(code=>topicMap.get(code)).filter(Boolean) as Topic[];
  const availableTopics=(data?.topics||[]).filter(topic=>!activeTopics.includes(topic.code));
  async function compose(nextSelections:Record<string,string>,reroll=false){
    if(!Object.keys(nextSelections).length){setAnswer("");setPhraseIds([]);return}
    setBusy(true);setWritten(false);setError("");
    try{const response=await fetch("/api/staff/quick-reply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"compose",bookingNo,documentId,selections:nextSelections,previousPhraseIds:reroll?phraseIds:[]})}),result=await response.json();if(!response.ok)throw new Error(result.error||"產生回覆失敗");setAnswer(result.finalAnswer);setPhraseIds(result.phraseIds||[]);setEditing(false)}catch(err){setError(err instanceof Error?err.message:"產生回覆失敗")}finally{setBusy(false)}
  }
  function choose(topicCode:string,optionCode:string){const next={...selections,[topicCode]:optionCode};setSelections(next);void compose(next)}
  function addTopic(code:string){setActiveTopics(value=>[...value,code]);setAddOpen(false);requestAnimationFrame(()=>document.getElementById(`quick-topic-${code}`)?.scrollIntoView({behavior:"smooth",block:"center"}))}
  async function write(){if(!answer.trim()||busy)return;setBusy(true);setError("");try{const response=await fetch("/api/staff/quick-reply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"write",bookingNo,documentId,selections,finalAnswer:answer,phraseIds})}),result=await response.json();if(!response.ok)throw new Error(result.error||"寫入失敗");setWritten(true);setEditing(false)}catch(err){setError(err instanceof Error?err.message:"寫入失敗，內容已保留，請重新寫入")}finally{setBusy(false)}}
  return <div className="quickReplyBackdrop"><section className="quickReplyPanel" role="dialog" aria-modal="true" aria-label="建立諮詢回覆"><header><div><span>固定句庫・不使用 Token</span><h2>建立諮詢回覆</h2>{data&&<p>{data.customerName}｜{data.bookingNo}</p>}</div><button onClick={onClose} aria-label="關閉">×</button></header>
    {loading?<div className="quickReplyStatus">正在讀取客人問題與句庫…</div>:error&&!data?<div className="quickReplyStatus error"><b>無法開啟</b><p>{error}</p><button onClick={onClose}>返回後台</button></div>:data&&<div className="quickReplyBody">
      <section className="quickReplyQuestions"><h3>客人的原始問題</h3>{data.questions.length?data.questions.map((question,index)=><p key={index}><b>問題 {index+1}</b>{question}</p>):<p>這筆資料沒有填寫文字問題，可以自行新增判斷項目。</p>}</section>
      <section className="quickReplySuggestions"><h3>系統建議</h3>{data.recommendedTopicCodes.length?<div>{data.recommendedTopicCodes.map(code=>{const topic=topicMap.get(code);return topic?<span key={code}>{topic.icon} {topic.title}</span>:null})}</div>:<p>沒有辨識到關鍵字，請自行新增判斷項目。</p>}</section>
      <div className="quickReplyTopics">{visibleTopics.map(topic=><section id={`quick-topic-${topic.code}`} key={topic.code}><h3>{topic.icon} {topic.title}</h3><div>{topic.options.map(option=><button key={option.code} className={selections[topic.code]===option.code?"selected":""} onClick={()=>choose(topic.code,option.code)} disabled={busy}>{selections[topic.code]===option.code&&<span>✓</span>}{option.label}</button>)}</div></section>)}</div>
      <div className="quickReplyAdd"><button onClick={()=>setAddOpen(value=>!value)}>＋ 新增判斷項目</button>{addOpen&&<div>{availableTopics.length?availableTopics.map(topic=><button key={topic.code} onClick={()=>addTopic(topic.code)}>{topic.icon} {topic.title}</button>):<p>所有題組都已顯示</p>}</div>}</div>
      <section className="quickReplyPreview"><div><h3>完整回覆預覽</h3>{answer&&<span>{editing?"可直接修改文字":"固定句庫已組合完成"}</span>}</div>{editing?<textarea value={answer} onChange={event=>setAnswer(event.target.value)} autoFocus/>:<p>{answer||"請先在上方選擇判斷結果，系統才會組合回覆。"}</p>}
        {error&&<div className="quickReplyError">{error}</div>}
        {written&&<div className="quickReplySuccess">✅ 已成功寫入 Google 諮詢單</div>}
        <div className="quickReplyPreviewActions"><button disabled={!answer||busy} onClick={()=>void compose(selections,true)}>↻ 換一種說法</button><button disabled={!answer||busy} onClick={()=>setEditing(value=>!value)}>✎ {editing?"完成修改":"自行修改"}</button></div>
      </section>
      <footer><button className="quickReplyWrite" disabled={!answer.trim()||busy} onClick={()=>void write()}>{busy?"處理中…":written?"再次寫入更新":"確認寫入"}</button>{written&&<a href={data.documentUrl} target="_blank" rel="noreferrer">查看 Google 文件</a>}<button className="quickReplyCancel" onClick={onClose}>返回預約後台</button></footer>
    </div>}
  </section></div>
}

