"use client";
import { useState } from "react";
import { timeOffWindow, validateTimeOff, type VideoTimeOff } from "@/lib/video-time-off";
import { taipeiDateKey } from "@/lib/taipei-time";
import "./time-off.css";
const label = (value: number) => new Intl.DateTimeFormat("zh-TW", {timeZone:"Asia/Taipei",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).format(value);
export default function TimeOffEditor({ entries, onChanged }: { entries: VideoTimeOff[]; onChanged: () => Promise<void> }) {
  const [id,setId]=useState(""),[date,setDate]=useState(taipeiDateKey()),[start,setStart]=useState("13:00"),[end,setEnd]=useState("15:00"),[note,setNote]=useState("");
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const invalid=validateTimeOff(date,start,end), window=invalid?null:timeOffWindow({off_date:date,start_time:start,end_time:end});
  async function save() {
    if(invalid || busy)return;
    setBusy(true);setMessage("");
    try {
      const response=await fetch("/api/admin/time-off",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:id||undefined,date,start,end,note})}),result=await response.json();
      if(!response.ok)throw Error(result.error||"儲存失敗");
      setId("");setNote("");await onChanged();setMessage("已儲存，前後一小時已一併封鎖");
    }catch(error){setMessage(error instanceof Error?error.message:"儲存失敗");}finally{setBusy(false);}
  }
  async function remove(entry:VideoTimeOff) {
    if(busy || !globalThis.confirm(`取消 ${entry.off_date} ${entry.start_time.slice(0,5)}～${entry.end_time.slice(0,5)} 的休假？原本已開放且符合條件的時段將恢復可預約。`))return;
    setBusy(true);setMessage("");
    try{const response=await fetch(`/api/admin/time-off?id=${encodeURIComponent(entry.id)}`,{method:"DELETE"}),result=await response.json();if(!response.ok)throw Error(result.error||"取消失敗");if(id===entry.id)setId("");await onChanged();setMessage("已取消此筆時段休假");}catch(error){setMessage(error instanceof Error?error.message:"取消失敗");}finally{setBusy(false);}
  }
  return <div className="timeOffEditor">
    <h3>部分時段休假</h3><p>只封鎖指定行程與前後各 1 小時，其他時段仍可預約。時間皆為台灣時間。</p>
    <fieldset disabled={busy}><legend>{id?"編輯休假時段":"新增休假時段"}</legend><div className="timeOffFields">
      <label>日期<input type="date" min={taipeiDateKey()} value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label>開始時間<input type="time" value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label>結束時間<input type="time" value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label>備註（選填）<input value={note} maxLength={500} onChange={e=>setNote(e.target.value)} placeholder="例如：外出行程"/></label>
    </div>
    <div className="timeOffPreview" role="status">{window?<>實際不開放預約：<strong>{label(window.start)} ～ {label(window.end)}</strong><small>包含前後各 1 小時；與此範圍重疊的整段諮詢也不可預約。</small></>:invalid}</div>
    <div className="timeOffButtons"><button type="button" disabled={!!invalid} onClick={()=>void save()}>{busy?"儲存中…":id?"儲存修改":"加入休假時段"}</button>{id&&<button type="button" onClick={()=>{setId("");setNote("");setMessage("")}}>取消編輯</button>}</div></fieldset>
    {message&&<p role="status">{message}</p>}
    <div className="timeOffEntries">{entries.filter(entry=>entry.off_date>=taipeiDateKey()).map(entry=>{const blocked=timeOffWindow(entry);return <article key={entry.id}><div><b>{entry.off_date}　{entry.start_time.slice(0,5)}～{entry.end_time.slice(0,5)}</b><small>不開放：{label(blocked.start)} ～ {label(blocked.end)}</small>{entry.note&&<span>{entry.note}</span>}</div><div className="timeOffButtons"><button type="button" disabled={busy} onClick={()=>{setId(entry.id);setDate(entry.off_date);setStart(entry.start_time.slice(0,5));setEnd(entry.end_time.slice(0,5));setNote(entry.note||"");setMessage("")}}>編輯</button><button type="button" disabled={busy} onClick={()=>void remove(entry)}>取消休假</button></div></article>})}</div>
    <p className="timeOffNote">新增休假不會取消已有預約；若當日已有預約，請一併確認行程。</p>
  </div>;
}
