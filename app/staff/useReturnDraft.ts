"use client";
import {useEffect,useRef,useState} from 'react';
export function useReturnDraft(identity:{bookingNo:string;documentId:string}|null,payload:unknown,ready:boolean,initialRevision:number,initialSnapshot:string){
 const [status,setStatus]=useState(''),[problem,setProblem]=useState('');
 const revision=useRef(initialRevision),saved=useRef(initialSnapshot),pending=useRef(''),inflight=useRef<Promise<void>|null>(null),initialized=useRef(false);
 if(identity&&initialSnapshot&&!initialized.current){revision.current=initialRevision;saved.current=initialSnapshot;initialized.current=true}
 pending.current=JSON.stringify(payload);
 const saveRef=useRef<()=>Promise<void>>(async()=>{});
 async function save(){
  if(!ready||!identity)return;
  if(inflight.current)return inflight.current;
  inflight.current=(async()=>{while(pending.current!==saved.current){const snapshot=pending.current;setStatus('saving');setProblem('');try{
   const response=await fetch('/api/staff/consultation-return/draft',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...identity,revision:revision.current,payload:JSON.parse(snapshot)})});
   const result=await response.json();if(!response.ok)throw new Error(result.error||'草稿儲存失敗');revision.current=result.revision;saved.current=snapshot;setStatus('saved');
  }catch(e){setStatus('failed');setProblem(e instanceof Error?e.message:'草稿儲存失敗');break}}})().finally(()=>{inflight.current=null});
  return inflight.current;
 }
 saveRef.current=save;
 const serialized=JSON.stringify(payload);
 useEffect(()=>{if(!ready||serialized===saved.current)return;setStatus('pending');const timer=setTimeout(()=>void saveRef.current(),700);return()=>clearTimeout(timer)},[serialized,ready]);
 useEffect(()=>{const beforeUnload=(event:BeforeUnloadEvent)=>{if(initialized.current&&pending.current!==saved.current){event.preventDefault();event.returnValue=''}};window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload)},[ready]);
 return {save,status,problem};
}
