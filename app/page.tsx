"use client";

import { useEffect, useMemo, useState } from "react";

type Method = { id:string; code:"video"|"text"; title:string; description:string|null; duration_minutes:number|null; base_price:number; monthly_limit:number|null; reply_days:number|null };
type SubItem = { id:string; title:string; description:string|null; price:number };
type Item = { id:string; consultation_method_id:string; title:string; description:string|null; price:number; allow_quantity:boolean; sub_items:SubItem[] };
type Slot = { slot_start:string; slot_end:string };

const money = (value:number) => new Intl.NumberFormat("zh-TW", { style:"currency", currency:"TWD", maximumFractionDigits:0 }).format(value);
const dateTime = (value:string) => new Intl.DateTimeFormat("zh-TW", { month:"numeric", day:"numeric", weekday:"short", hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"Asia/Taipei" }).format(new Date(value));

export default function BookingSystem() {
  const [step,setStep] = useState(1); const [methods,setMethods] = useState<Method[]>([]); const [items,setItems] = useState<Item[]>([]);
  const [method,setMethod] = useState<Method|null>(null); const [counts,setCounts] = useState<Record<string,number>>({}); const [subs,setSubs] = useState<Record<string,boolean>>({});
  const [slots,setSlots] = useState<Slot[]>([]); const [slotStart,setSlotStart] = useState(""); const [name,setName] = useState(""); const [phone,setPhone] = useState("");
  const [payment,setPayment] = useState<"transfer"|"credit_card"|"">(""); const [loading,setLoading] = useState(true); const [submitting,setSubmitting] = useState(false); const [error,setError] = useState(""); const [bookingNo,setBookingNo] = useState("");
  const [lineId,setLineId] = useState("");

  useEffect(() => { setLineId(new URLSearchParams(location.search).get("lineId") ?? ""); fetch("/api/catalog").then(async r => { const j=await r.json(); if(!r.ok) throw new Error(j.error); setMethods(j.methods); setItems(j.items); }).catch(e=>setError(e.message)).finally(()=>setLoading(false)); },[]);
  const visibleItems = useMemo(()=>items.filter(i=>i.consultation_method_id===method?.id),[items,method]);
  const selected = visibleItems.filter(i=>(counts[i.id]??0)>0);
  const total = (method?.base_price??0) + selected.reduce((sum,item)=>sum+item.price*counts[item.id]+item.sub_items.reduce((s,x)=>s+(subs[x.id]?x.price*counts[item.id]:0),0),0);

  function chooseMethod(value:Method){ setMethod(value); setCounts({}); setSubs({}); setSlotStart(""); setSlots([]); }
  async function next(){ setError("");
    if(step===1){ if(!method) return setError("請先選擇諮詢方式"); setStep(2); return; }
    if(step===2){ if(!selected.length) return setError("請至少選擇一個諮詢項目"); if(method?.code==="video"){ setLoading(true); try { const r=await fetch(`/api/slots?methodId=${method.id}`); const j=await r.json(); if(!r.ok) throw new Error(j.error); setSlots(j.slots); } catch(e){setError(e instanceof Error?e.message:"無法讀取時段");} finally{setLoading(false);} } setStep(3); return; }
    if(step===3){ if(method?.code==="video"&&!slotStart) return setError("請選擇預約時段"); setStep(4); return; }
    if(step===4){ if(!name.trim()||!/^09\d{8}$/.test(phone)||!payment) return setError("請填寫姓名、正確的手機號碼並選擇付款方式"); setSubmitting(true); try { const r=await fetch("/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({methodId:method?.id,name,phone,lineId,slotStart:slotStart||null,paymentMethod:payment,items:selected.map(i=>({item_id:i.id,quantity:counts[i.id],sub_item_ids:i.sub_items.filter(s=>subs[s.id]).map(s=>s.id)}))})}); const j=await r.json(); if(!r.ok) throw new Error(j.error); setBookingNo(j.booking?.booking_no??""); setStep(5); } catch(e){setError(e instanceof Error?e.message:"預約失敗");} finally{setSubmitting(false);} }
  }
  function back(){ setError(""); setStep(s=>Math.max(1,s-1)); }

  if(loading&&step===1) return <main className="shell"><section className="card center">正在載入預約資料…</section></main>;
  return <main className="shell"><section className="app">
    <header><p className="eyebrow">LIN A-SAO CONSULTATION</p><h1>林阿嫂線上諮詢預約</h1><div className="progress">{["方式","項目","時段","資料","完成"].map((x,i)=><span key={x} className={step>=i+1?"on":""}>{i+1}<small>{x}</small></span>)}</div></header>
    <div className="content">{error&&<div className="error">{error}</div>}
      {step===1&&<><h2>選擇諮詢方式</h2><p className="hint">先選擇最適合你的諮詢形式</p><div className="stack">{methods.map(m=><button className={`choice ${method?.id===m.id?"selected":""}`} key={m.id} onClick={()=>chooseMethod(m)}><div><b>{m.title}</b><p>{m.description}</p></div><strong>{m.base_price?`基本費 ${money(m.base_price)}`:"免基本費"}<small>{m.code==="video"?`${m.duration_minutes} 分鐘`:`${m.reply_days} 天內回覆`}</small></strong></button>)}</div></>}
      {step===2&&<><h2>選擇諮詢項目</h2><p className="hint">目前選擇：{method?.title}</p><div className="stack">{visibleItems.map(item=><article className="item" key={item.id}><div className="itemTop"><div><b>{item.title}</b><p>{item.description}</p></div><strong>{money(item.price)}</strong></div><div className="counter"><button onClick={()=>setCounts(c=>({...c,[item.id]:Math.max(0,(c[item.id]??0)-1)}))}>−</button><span>{counts[item.id]??0}</span><button onClick={()=>setCounts(c=>({...c,[item.id]:item.allow_quantity?(c[item.id]??0)+1:1}))}>＋</button></div>{item.sub_items.length>0&&<div className="subList"><small>可加購項目</small>{item.sub_items.map(s=><label key={s.id} className={(counts[item.id]??0)===0?"disabled":""}><input type="checkbox" checked={!!subs[s.id]} disabled={(counts[item.id]??0)===0} onChange={e=>setSubs(v=>({...v,[s.id]:e.target.checked}))}/><span>{s.title}<em>{s.description}</em></span><b>+{money(s.price)}</b></label>)}</div>}</article>)}</div><div className="total"><span>目前合計</span><b>{money(total)}</b></div></>}
      {step===3&&method?.code==="video"&&<><h2>選擇預約時段</h2><p className="hint">每次視訊諮詢 {method.duration_minutes} 分鐘，顯示未來 30 天可預約時段</p>{slots.length?<div className="slots">{slots.map(s=><button className={slotStart===s.slot_start?"selected":""} key={s.slot_start} onClick={()=>setSlotStart(s.slot_start)}>{dateTime(s.slot_start)}</button>)}</div>:<div className="empty">目前沒有可預約時段，請稍後再查看。</div>}</>}
      {step===3&&method?.code==="text"&&<><h2>文字諮詢說明</h2><div className="notice"><span>✦</span><b>不需要選擇日期與時間</b><p>完成付款並提供資料後，老師將於 {method.reply_days} 天內回覆諮詢結果。</p></div></>}
      {step===4&&<><h2>聯絡與付款資料</h2><div className="form"><label>姓名<input value={name} onChange={e=>setName(e.target.value)} placeholder="請輸入真實姓名"/></label><label>手機號碼<input value={phone} onChange={e=>setPhone(e.target.value.replace(/\D/g,"").slice(0,10))} inputMode="tel" placeholder="09xxxxxxxx"/></label><fieldset><legend>付款方式</legend><label className="radio"><input type="radio" checked={payment==="transfer"} onChange={()=>setPayment("transfer")}/>銀行轉帳</label><label className="radio"><input type="radio" checked={payment==="credit_card"} onChange={()=>setPayment("credit_card")}/>信用卡（預約建立後進行付款）</label></fieldset></div><div className="summary"><p><span>諮詢方式</span><b>{method?.title}</b></p>{method?.code==="video"&&<p><span>預約時段</span><b>{dateTime(slotStart)}</b></p>}<p><span>應付總額</span><b>{money(total)}</b></p></div></>}
      {step===5&&<div className="success"><div>✓</div><h2>預約已建立</h2><p>預約編號</p><strong>{bookingNo}</strong><p>請依後續付款指示完成付款，付款確認前預約狀態為「待付款」。</p></div>}
    </div>{step<5&&<footer>{step>1&&<button className="back" onClick={back}>上一步</button>}<button className="next" disabled={submitting} onClick={next}>{submitting?"建立預約中…":step===4?"確認並建立預約":"下一步"}</button></footer>}
  </section></main>;
}
