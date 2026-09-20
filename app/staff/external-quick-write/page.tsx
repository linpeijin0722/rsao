"use client";
import { useEffect, useMemo, useState } from "react";
import "../style.css";

type DriveDocument = { id:string; name:string; modifiedTime:string; webViewLink:string };

export default function ExternalQuickWritePage() {
  const [documents,setDocuments]=useState<DriveDocument[]>([]),[selectedId,setSelectedId]=useState(""),[answer,setAnswer]=useState(""),[query,setQuery]=useState(""),[loading,setLoading]=useState(true),[reading,setReading]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  const selected=documents.find(document=>document.id===selectedId);
  const filtered=useMemo(()=>documents.filter(document=>document.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())),[documents,query]);

  useEffect(()=>{void (async()=>{try{const response=await fetch("/api/staff/external-consultation-docs",{cache:"no-store"}),result=await response.json();if(!response.ok)throw new Error(result.error||"讀取失敗");setDocuments(result.documents||[])}catch(value){setError(value instanceof Error?value.message:"讀取失敗")}finally{setLoading(false)}})()},[]);
  async function choose(document:DriveDocument){setSelectedId(document.id);setReading(true);setError("");setSaved(false);try{const response=await fetch(`/api/staff/external-consultation-docs?documentId=${encodeURIComponent(document.id)}`,{cache:"no-store"}),result=await response.json();if(!response.ok)throw new Error(result.error||"讀取失敗");setAnswer(result.answer||"")}catch(value){setError(value instanceof Error?value.message:"讀取失敗")}finally{setReading(false)}}
  async function save(){if(!selectedId||!answer.trim())return;setSaving(true);setError("");setSaved(false);try{const response=await fetch("/api/staff/external-consultation-docs",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({documentId:selectedId,answer})}),result=await response.json();if(!response.ok)throw new Error(result.error||"寫入失敗");setSaved(true)}catch(value){setError(value instanceof Error?value.message:"寫入失敗")}finally{setSaving(false)}}

  return <main className="externalQuickWritePage">
    <header><div><small>非預約系統建立的文件</small><h1>外部諮詢單快速寫入</h1><p>選擇 Google 諮詢單，直接新增或更新文件底部的「【阿嫂回答】」。</p></div><a href="/staff">返回預約後台</a></header>
    {error&&<div className="externalQuickWriteError">{error}{error==="未登入"&&<a href="/staff">請先回後台登入</a>}</div>}
    <section className="externalQuickWriteGrid">
      <aside><label>搜尋文件<input value={query} onChange={event=>setQuery(event.target.value)} placeholder="輸入姓名或文件名稱"/></label><div className="externalDocumentList">{loading?<p>正在讀取 Google Drive…</p>:filtered.length?filtered.map(document=><button type="button" className={selectedId===document.id?"active":""} key={document.id} onClick={()=>void choose(document)}><b>{document.name}</b><small>{document.modifiedTime?new Date(document.modifiedTime).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"}):"未知時間"}</small></button>):<p>找不到符合的 Google 文件。</p>}</div></aside>
      <article>{selected?<><div className="externalEditorTitle"><div><small>目前文件</small><h2>{selected.name}</h2></div><a href={selected.webViewLink} target="_blank" rel="noreferrer">開啟 Google 文件</a></div>{reading?<p>正在讀取已有回答…</p>:<><label>阿嫂回答<textarea value={answer} onChange={event=>{setAnswer(event.target.value);setSaved(false)}} placeholder="請在這裡輸入諮詢回答…"/></label><div className="externalEditorActions"><button type="button" disabled={saving||!answer.trim()} onClick={()=>void save()}>{saving?"寫入中…":"確認寫入 Google 諮詢單"}</button>{saved&&<strong>✓ 已成功寫入</strong>}</div></>}</>:<div className="externalQuickWriteEmpty"><b>請先選擇一份諮詢單</b><p>只會顯示指定資料夾內的 Google 文件。</p></div>}</article>
    </section>
  </main>;
}
