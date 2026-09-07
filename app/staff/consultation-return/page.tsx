"use client";
import { useEffect, useMemo, useState } from "react";

type ReturnItem = { index:number; itemTitle:string; content:string };
type Preview = { bookingNo:string; customerName:string; lineDisplayName:string; documentId:string; documentUrl:string; items:ReturnItem[] };

export default function ConsultationReturnPage(){
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[active,setActive]=useState(0),[selected,setSelected]=useState<number[]>([]),[confirmOpen,setConfirmOpen]=useState(false),[sending,setSending]=useState(false),[sent,setSent]=useState(false);
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),bookingNo=params.get("bookingNo")||"",documentId=params.get("documentId")||"";
    fetch(`/api/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`).then(async response=>{
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||"讀取失敗");
      setData(result);setSelected((result.items||[]).map((item:ReturnItem)=>item.index));
    }).catch(err=>setError(err instanceof Error?err.message:"讀取失敗")).finally(()=>setLoading(false));
  },[]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;if(confirmOpen&&!sending)setConfirmOpen(false);else if(data?.documentUrl)window.location.href=data.documentUrl};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[confirmOpen,sending,data]);
  const item=data?.items[active];
  const selectedSet=useMemo(()=>new Set(selected),[selected]);
  const toggle=(index:number)=>setSelected(value=>value.includes(index)?value.filter(x=>x!==index):[...value,index].sort((a,b)=>a-b));
  async function send(){if(!data||sending)return;setSending(true);try{const response=await fetch("/api/staff/consultation-return",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookingNo:data.bookingNo,documentId:data.documentId,selectedIndexes:selected})}),result=await response.json();if(!response.ok)throw new Error(result.error||"回傳失敗");setConfirmOpen(false);setSent(true)}catch(err){alert(err instanceof Error?err.message:"回傳失敗")}finally{setSending(false)}}
  if(loading)return <main className="returnResultPage"><div className="returnResultCard returnResultStatus">正在讀取 Google 諮詢單…</div></main>;
  if(error)return <main className="returnResultPage"><div className="returnResultCard returnResultStatus"><h1>無法開啟回傳頁面</h1><p>{error}</p><a href="/staff">回預約後台</a></div></main>;
  if(!data||!item)return null;
  return <main className="returnResultPage">
    <section className="returnResultCard">
      <header className="returnResultHeader"><div><span>回傳諮詢結果</span><h1>{data.customerName}</h1><p>訂單編號：{data.bookingNo}</p></div><a className="returnResultEditLink" href={data.documentUrl}>返回 Google 文件編輯</a></header>
      {sent?<div className="returnResultSuccess"><div>✓</div><h2>諮詢結果已回傳 LINE</h2><p>已完成傳送。你可以回 Google 文件繼續編輯。</p><a href={data.documentUrl}>返回 Google 文件</a></div>:<>
        <div className="returnResultSelect"><b>選擇要回傳的項目</b><div>{data.items.map(entry=><label key={entry.index} className={selectedSet.has(entry.index)?"selected":""}><input type="checkbox" checked={selectedSet.has(entry.index)} onChange={()=>toggle(entry.index)}/><span>{entry.index}</span><strong>{entry.itemTitle}</strong></label>)}</div></div>
        <div className="returnResultPager"><button disabled={active===0} onClick={()=>setActive(value=>Math.max(0,value-1))}>‹</button><div><small>預覽 {active+1} / {data.items.length}</small><h2>項目 {item.index}｜{item.itemTitle}</h2></div><button disabled={active===data.items.length-1} onClick={()=>setActive(value=>Math.min(data.items.length-1,value+1))}>›</button></div>
        <article className="returnResultPreview"><div className="returnResultPreviewTitle"><span>LINE 將回傳以下內容</span><em>{selectedSet.has(item.index)?"已勾選":"未勾選"}</em></div><pre>{item.content}</pre></article>
        <footer className="returnResultFooter"><a href={data.documentUrl}>返回編輯</a><button disabled={!selected.length} onClick={()=>setConfirmOpen(true)}>確認傳送（{selected.length} 項）</button></footer>
      </>}
    </section>
    {confirmOpen&&<div className="returnConfirmBackdrop" onClick={()=>!sending&&setConfirmOpen(false)}><div className="returnConfirmModal" onClick={event=>event.stopPropagation()}><button className="returnConfirmClose" disabled={sending} onClick={()=>setConfirmOpen(false)}>×</button><span>最後確認</span><h2>確定回傳給 {data.customerName}？</h2><p>將把你勾選的 <b>{selected.length}</b> 個項目，依目前 Google 文件的最新內容傳送到該 LINE 用戶。</p><div className="returnConfirmItems">{data.items.filter(entry=>selectedSet.has(entry.index)).map(entry=><div key={entry.index}><span>{entry.index}</span>{entry.itemTitle}</div>)}</div><div className="returnConfirmActions"><button disabled={sending} onClick={()=>setConfirmOpen(false)}>取消</button><button disabled={sending} onClick={send}>{sending?"傳送中…":"確定回傳 LINE"}</button></div></div></div>}
  </main>
}
