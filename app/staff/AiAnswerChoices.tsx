"use client";
import {useEffect,useRef,useState} from "react";
type Choice={slotIndex:number;questionNumber:number;question:string;profileName:string;options:string[]};
export default function AiAnswerChoices({fingerprint,generate,onChoose}:{fingerprint:string;generate:()=>Promise<{choices:Choice[]}>;onChoose:(slot:number,answer:string)=>boolean}){
 const [choices,setChoices]=useState<Choice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[selected,setSelected]=useState<Record<number,number>>({}),current=useRef(fingerprint),request=useRef(0);current.current=fingerprint;
 useEffect(()=>{setChoices([]);setSelected({});request.current++;setBusy(false)},[fingerprint]);
 async function run(){const source=current.current,id=++request.current;setBusy(true);setError("");try{const result=await generate();if(id===request.current&&source===current.current){setChoices(result.choices);setSelected({})}}catch(e){if(id===request.current)setError(e instanceof Error?e.message:"AI 回答產生失敗")}finally{if(id===request.current)setBusy(false)}}
 return <section className="aiAnswerChoices"><h3>AI 快速回覆問題</h3><p>依阿嫂已寫好的內容，每題提供 3 種說法；點選後填入答案，仍可自行修改。</p><button disabled={busy} onClick={()=>void run()}>{busy?"正在產生回答…":"AI 產生每題 3 種回答"}</button>{error&&<p role="alert">{error}</p>}{choices.map(q=><article key={q.slotIndex}><h4>{q.profileName}・Q{q.questionNumber}：{q.question}</h4><div>{q.options.map((answer,i)=><button key={i} aria-pressed={selected[q.slotIndex]===i} className={selected[q.slotIndex]===i?"selected":""} onClick={()=>{if(onChoose(q.slotIndex,answer))setSelected(c=>({...c,[q.slotIndex]:i}))}}><b>回答 {i+1}</b><span>{answer}</span></button>)}</div></article>)}</section>;
}
