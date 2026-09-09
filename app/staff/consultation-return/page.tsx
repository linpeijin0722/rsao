"use client";
import { useEffect, useMemo, useRef, useState } from "react";

type ReturnItem = { index:number; itemTitle:string; content:string };
type Preview = { bookingNo:string; customerName:string; lineDisplayName:string; linePictureUrl:string; documentId:string; documentUrl:string; returnedAt:string|null; items:ReturnItem[] };
type SendMode = "immediate" | "scheduled";
const normalizeDraft=(value:string)=>String(value||"").replace(/\r\n?/g,"\n").replace(/[ \t]+$/gm,"").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g,"\n\n").trim();

function taipeiDefaults(){
  const taipeiMs=Date.now()+8*60*60*1000;
  const rounded=new Date(Math.ceil((taipeiMs+60_000)/(30*60*1000))*(30*60*1000));
  const pad=(value:number)=>String(value).padStart(2,"0");
  return {date:`${rounded.getUTCFullYear()}-${pad(rounded.getUTCMonth()+1)}-${pad(rounded.getUTCDate())}`,time:`${pad(rounded.getUTCHours())}:${pad(rounded.getUTCMinutes())}`};
}
function scheduleDate(date:string,time:string){return new Date(`${date}T${time}:00+08:00`)}
function scheduleLabel(date:string,time:string){
  const value=scheduleDate(date,time);
  if(!Number.isFinite(value.getTime()))return "";
  const parts=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",weekday:"short",hour:"numeric",minute:"2-digit",hour12:true}).formatToParts(value);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value||"";
  const week=get("weekday").replace("週","").replace("星期","");
  return `${get("month")}/${get("day")}(${week})${get("dayPeriod")}${get("hour")}:${get("minute")}`;
}

export default function ConsultationReturnPage(){
  const defaults=useMemo(taipeiDefaults,[]);
  const [data,setData]=useState<Preview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[active,setActive]=useState(0),[selected,setSelected]=useState<number[]>([]),[choiceOpen,setChoiceOpen]=useState(false),[scheduleOpen,setScheduleOpen]=useState(false),[confirmMode,setConfirmMode]=useState<SendMode|null>(null),[editConfirm,setEditConfirm]=useState(false),[skipConfirm,setSkipConfirm]=useState(false),[skipCarousel,setSkipCarousel]=useState(false),[editing,setEditing]=useState(false),[drafts,setDrafts]=useState<Record<number,string>>({}),[sending,setSending]=useState(false),[completed,setCompleted]=useState<SendMode|null>(null),[scheduleDateValue,setScheduleDateValue]=useState(defaults.date),[scheduleTimeValue,setScheduleTimeValue]=useState(defaults.time);
  const editorRef=useRef<HTMLTextAreaElement|null>(null);
  const selectedSet=useMemo(()=>new Set(selected),[selected]);
  const selectedItems=useMemo(()=>data?.items.filter(entry=>selectedSet.has(entry.index))||[],[data,selectedSet]);
  const item=selectedItems[active];
  const scheduledValue=useMemo(()=>scheduleDate(scheduleDateValue,scheduleTimeValue),[scheduleDateValue,scheduleTimeValue]);
  const scheduledLabel=useMemo(()=>scheduleLabel(scheduleDateValue,scheduleTimeValue),[scheduleDateValue,scheduleTimeValue]);
  const scheduleMinutes=Number(scheduleTimeValue.slice(0,2))*60+Number(scheduleTimeValue.slice(3,5));
  const outsideRecommendedHours=Number.isFinite(scheduleMinutes)&&(scheduleMinutes<7*60||scheduleMinutes>21*60);

  useEffect(()=>{const params=new URLSearchParams(window.location.search),bookingNo=params.get("bookingNo")||"",documentId=params.get("documentId")||"";fetch(`/api/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result.error||"讀取失敗");setData(result);setSelected((result.items||[]).map((entry:ReturnItem)=>entry.index));setDrafts(Object.fromEntries((result.items||[]).map((entry:ReturnItem)=>[entry.index,entry.content])))}).catch(err=>setError(err instanceof Error?err.message:"讀取失敗")).finally(()=>setLoading(false))},[]);
  useEffect(()=>{if(editing)editorRef.current?.focus()},[editing]);
  useEffect(()=>{setActive(value=>Math.max(0,Math.min(value,selectedItems.length-1)))},[selectedItems.length]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape"){if(editConfirm)setEditConfirm(false);else if(confirmMode&&!sending)setConfirmMode(null);else if(scheduleOpen)setScheduleOpen(false);else if(choiceOpen)setChoiceOpen(false);else if(skipConfirm)setSkipConfirm(false);else if(editing)setEditing(false);else if(data?.documentUrl)window.location.href=data.documentUrl;return}if(event.key==="Enter"&&editConfirm){event.preventDefault();setEditConfirm(false);setEditing(true);return}if(choiceOpen||scheduleOpen||confirmMode||skipConfirm||sending)return;const key=event.key.toLowerCase();if(event.key==="ArrowLeft"||key==="q"){event.preventDefault();setEditing(false);setActive(value=>Math.max(0,value-1))}if(event.key==="ArrowRight"||key==="e"){event.preventDefault();setEditing(false);setActive(value=>Math.min(Math.max(0,selectedItems.length-1),value+1))}if(event.key==="Enter"&&!editing&&item){event.preventDefault();setEditConfirm(true)}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey)},[choiceOpen,scheduleOpen,confirmMode,skipConfirm,editConfirm,sending,editing,data,item,selectedItems.length]);

  const toggle=(index:number)=>setSelected(value=>value.includes(index)?value.filter(x=>x!==index):[...value,index].sort((a,b)=>a-b));
  async function openLineCustomer(){if(!data)return;window.open("https://chat.line.biz/U7fdf75a6ae75028c4aa102f6b4ebbc7d/","_blank","noopener,noreferrer");try{await navigator.clipboard.writeText(data.lineDisplayName||data.customerName)}catch{window.alert(`請複製 LINE 名稱：${data.lineDisplayName||data.customerName}`)}}
  function openScheduleConfirmation(){
    if(!scheduleDateValue||!scheduleTimeValue)return alert("請選擇排程日期與時間");
    if(!scheduleTimeValue.endsWith(":00")&&!scheduleTimeValue.endsWith(":30"))return alert("排程時間只能選擇整點或半點（00／30 分）");
    if(!Number.isFinite(scheduledValue.getTime())||scheduledValue.getTime()<=Date.now()+30000)return alert("排程時間必須晚於現在，請重新選擇");
    setScheduleOpen(false);setConfirmMode("scheduled");
  }
  async function send(mode:SendMode){
    if(!data||sending)return;setSending(true);
    try{
      const editedItems=Object.fromEntries(data.items.filter(entry=>drafts[entry.index]!==entry.content).map(entry=>[entry.index,drafts[entry.index]]));
      const response=await fetch("/api/staff/consultation-return",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode,bookingNo:data.bookingNo,documentId:data.documentId,selectedIndexes:selected,editedItems,skipCarousel,scheduledAt:mode==="scheduled"?scheduledValue.toISOString():undefined})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"回傳失敗");
      if(mode==="immediate")setData(current=>current?{...current,returnedAt:result.returnedAt||current.returnedAt}:current);
      setConfirmMode(null);setCompleted(mode);
    }catch(err){alert(err instanceof Error?err.message:"回傳失敗")}finally{setSending(false)}
  }

  if(loading)return <main className="returnResultPage"><div className="returnResultCard returnResultStatus">正在讀取 Google 諮詢單…</div></main>;
  if(error)return <main className="returnResultPage"><div className="returnResultCard returnResultStatus"><h1>無法開啟回傳頁面</h1><p>{error}</p><a href="/staff">回預約後台</a></div></main>;
  if(!data)return null;
  const returnedTime=data.returnedAt?new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(data.returnedAt)):"";
  return <main className="returnResultPage"><h1 className="returnResultPageTitle">回傳諮詢結果</h1><section className="returnResultCard">
    <header className="returnResultHeader"><div className="returnResultCustomerRow"><button className="returnResultLineProfile" onClick={()=>void openLineCustomer()} title="開啟 LINE 後台並複製 LINE 名稱">{data.linePictureUrl?<img src={data.linePictureUrl} alt="LINE 頭像"/>:<span>LINE</span>}<b>{data.lineDisplayName||"LINE 用戶"}</b></button><div className="returnResultIdentity"><h1>{data.customerName}</h1><p>訂單編號：{data.bookingNo}</p></div></div><a className="returnResultEditLink" href={data.documentUrl}>返回 Google 文件編輯</a></header>
    {completed?<div className="returnResultSuccess"><div>{completed==="scheduled"?"◷":"✓"}</div><h2>{completed==="scheduled"?"諮詢結果已完成排程":"諮詢結果已回傳 LINE"}</h2><p>{completed==="scheduled"?`訊息將於 ${scheduledLabel} 自動傳送。`:"已完成傳送。你可以回 Google 文件繼續編輯。"}</p><a href={data.documentUrl}>返回 Google 文件</a></div>:<><div className="returnResultSelect"><div className="returnResultSelectHeading"><b>選擇要回傳的項目</b><span><button onClick={()=>setSelected(data.items.map(entry=>entry.index))}>全部選取</button><button onClick={()=>setSelected([])}>全部取消</button></span></div><div>{data.items.map(entry=><label key={entry.index} className={selectedSet.has(entry.index)?"selected":""}><input type="checkbox" checked={selectedSet.has(entry.index)} onChange={()=>toggle(entry.index)}/><span>{entry.index}</span><strong>{entry.itemTitle}</strong></label>)}</div></div>
      {item&&<><div className="returnResultPager"><button disabled={active===0} onClick={()=>{setEditing(false);setActive(value=>Math.max(0,value-1))}}>‹</button><div><small>預覽 {active+1} / {selectedItems.length}</small><h2>項目 {item.index}｜{item.itemTitle}</h2></div><button disabled={active===selectedItems.length-1} onClick={()=>{setEditing(false);setActive(value=>Math.min(selectedItems.length-1,value+1))}}>›</button></div><article className="returnResultPreview" tabIndex={0} onDoubleClick={()=>!editing&&setEditConfirm(true)}><div className="returnResultPreviewTitle"><span>LINE 將回傳以下內容</span><em>{editing?"編輯中，點框外完成":"按 Enter 可編輯"}</em></div>{editing?<textarea ref={editorRef} value={drafts[item.index]??item.content} onChange={event=>setDrafts(current=>({...current,[item.index]:event.target.value}))} onBlur={()=>{setDrafts(current=>({...current,[item.index]:normalizeDraft(current[item.index]??item.content)}));setEditing(false)}}/>:<pre>{drafts[item.index]??item.content}</pre>}</article></>}
      <footer className="returnResultFooter"><button className={`skipCarouselButton ${skipCarousel?"selected":""}`} onClick={()=>skipCarousel?setSkipCarousel(false):setSkipConfirm(true)}><span>{skipCarousel?"✓ 這次不回傳輪播訊息":"這次不要回傳輪播訊息"}</span>{skipCarousel&&<small>已勾選，只傳送文字結果</small>}</button><button className="returnSendButton" disabled={!selected.length} onClick={()=>setChoiceOpen(true)}><span>確認傳送（{selected.length} 項）</span>{returnedTime&&<small>上次回傳時間：{returnedTime}</small>}</button></footer></>}
  </section>
  {editConfirm&&<div className="returnConfirmBackdrop" onClick={()=>setEditConfirm(false)}><div className="returnConfirmModal returnEditConfirm" onClick={event=>event.stopPropagation()}><span>編輯確認</span><h2>確定要編輯這項回傳內容？</h2><p>編輯後，LINE 將傳送你修改過的版本，不會改動原本的 Google 文件。</p><div className="returnConfirmActions"><button onClick={()=>setEditConfirm(false)}>取消</button><button onClick={()=>{setEditConfirm(false);setEditing(true)}}>開始編輯</button></div></div></div>}
  {skipConfirm&&<div className="returnConfirmBackdrop" onClick={()=>setSkipConfirm(false)}><div className="returnConfirmModal" onClick={event=>event.stopPropagation()}><span>傳送方式確認</span><h2>這次不要回傳輪播訊息？</h2><p>確認後，本次只會傳送勾選的文字諮詢結果，不會在最後附上圖片輪播。</p><div className="returnConfirmActions"><button onClick={()=>setSkipConfirm(false)}>取消</button><button onClick={()=>{setSkipCarousel(true);setSkipConfirm(false)}}>確認不要輪播</button></div></div></div>}
  {choiceOpen&&<div className="returnConfirmBackdrop" onClick={()=>setChoiceOpen(false)}><div className="returnConfirmModal returnDeliveryChoice" onClick={event=>event.stopPropagation()}><button className="returnConfirmClose" onClick={()=>setChoiceOpen(false)}>×</button><span>選擇傳送時間</span><h2>這次要如何傳送？</h2><p>兩種方式都會再顯示最後確認，確認後才會執行。</p><div className="returnDeliveryButtons"><button onClick={()=>{setChoiceOpen(false);setConfirmMode("immediate")}}><b>立即傳送</b><small>確認後立刻傳送給 LINE 用戶</small></button><button onClick={()=>{setChoiceOpen(false);setScheduleOpen(true)}}><b>排程傳送</b><small>指定日期與時間自動傳送</small></button></div></div></div>}
  {scheduleOpen&&<div className="returnConfirmBackdrop" onClick={()=>setScheduleOpen(false)}><div className="returnConfirmModal returnSchedulePicker" onClick={event=>event.stopPropagation()}><button className="returnConfirmClose" onClick={()=>setScheduleOpen(false)}>×</button><span>排程傳送</span><h2>選擇傳送日期與時間</h2><p>系統會保存目前預覽內容；時間以每半小時為單位，可選整點或半點。</p><div className="returnScheduleFields"><label><span>傳送日期</span><input type="date" value={scheduleDateValue} min={new Date().toLocaleDateString("en-CA",{timeZone:"Asia/Taipei"})} onChange={event=>setScheduleDateValue(event.target.value)}/></label><label><span>傳送時間</span><input type="time" step="1800" value={scheduleTimeValue} onChange={event=>setScheduleTimeValue(event.target.value)}/><small>僅可選 00 或 30 分</small></label></div><div className="returnConfirmActions"><button onClick={()=>setScheduleOpen(false)}>取消</button><button onClick={openScheduleConfirmation}>下一步確認</button></div></div></div>}
  {confirmMode&&<div className="returnConfirmBackdrop" onClick={()=>!sending&&setConfirmMode(null)}><div className={`returnConfirmModal ${confirmMode==="scheduled"?"returnScheduleConfirm":""}`} onClick={event=>event.stopPropagation()}><button className="returnConfirmClose" disabled={sending} onClick={()=>setConfirmMode(null)}>×</button><span>{confirmMode==="scheduled"?(outsideRecommendedHours?"非建議時段提醒":"排程最後確認"):"最後確認"}</span><h2>{confirmMode==="scheduled"?`訊息將於 ${scheduledLabel} 傳送`:`確定回傳給 ${data.customerName}？`}</h2><p>{confirmMode==="scheduled"&&outsideRecommendedHours&&<><strong className="returnScheduleWarning">此時間位於建議聯繫時段（上午 7:00 至晚上 9:00）之外，可能打擾用戶休息，請再次確認是否仍要排程。</strong><br/></>}將把你勾選的 <b>{selected.length}</b> 個項目，以目前預覽的內容傳送到該 LINE 用戶。{skipCarousel&&<><br/><strong>本次已選擇不傳送輪播訊息。</strong></>}</p><div className="returnConfirmItems">{data.items.filter(entry=>selectedSet.has(entry.index)).map(entry=><div key={entry.index}><span>{entry.index}</span>{entry.itemTitle}</div>)}</div><div className="returnConfirmActions"><button disabled={sending} onClick={()=>{setConfirmMode(null);if(confirmMode==="scheduled")setScheduleOpen(true)}}>{confirmMode==="scheduled"?"返回更改":"取消"}</button><button disabled={sending} onClick={()=>void send(confirmMode)}>{sending?(confirmMode==="scheduled"?"建立排程中…":"傳送中…"):(confirmMode==="scheduled"?"確認排程":"確定回傳 LINE")}</button></div></div></div>}
  </main>;
}
