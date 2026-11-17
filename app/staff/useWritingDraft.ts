"use client";
import {useEffect,useRef,useState} from 'react';
export function useWritingDraft(identity:{bookingNo:string;documentId:string;scope:string;accessToken:string},payload:any,enabled:boolean,restore:(payload:any)=>void){
 const [ready,setReady]=useState(false),[status,setStatus]=useState('loading'),[problem,setProblem]=useState(''),[reload,setReload]=useState(0);
 const revision=useRef(0),saved=useRef(''),latest=useRef(''),inflight=useRef<Promise<void>|null>(null),conflict=useRef(false),restoreRef=useRef(restore),saveRef=useRef<()=>Promise<void>>(async()=>{}),loadingRef=useRef(true),epoch=useRef(0);
 const key=JSON.stringify([identity.bookingNo,identity.documentId,identity.scope]);
 restoreRef.current=restore;latest.current=JSON.stringify(payload);
 useEffect(()=>{
  epoch.current++;setReady(false);loadingRef.current=true;if(!enabled)return;let cancelled=false;setStatus('loading');setProblem('');
  (async()=>{try{
   const response=await fetch('/api/staff/writing-draft?'+new URLSearchParams(identity),{cache:'no-store'}),result=await response.json();
   if(!response.ok)throw Error(result.error||'草稿讀取失敗');if(cancelled)return;
   revision.current=result.draft?.revision||0;conflict.current=false;
   const draft=result.draft?.payload;
   if(draft&&draft.version!==1)throw Error('草稿版本無法辨識，請聯絡助理');
   if(draft?.documentShape&&draft.documentShape!==JSON.parse(latest.current).documentShape)throw Error('文件項目、問題或對象已變更，舊草稿暫停套用；請助理核對，避免填到另一位對象。');
   if(draft){saved.current=JSON.stringify(draft);restoreRef.current(draft);}else saved.current=latest.current;
   setStatus('saved');setReady(true);loadingRef.current=false;
  }catch(e){if(!cancelled){setProblem(e instanceof Error?e.message:'草稿讀取失敗');setStatus('failed');}}})();
  return()=>{cancelled=true;};
 },[key,enabled,reload]);
 async function save(){
  if(!ready||loadingRef.current||conflict.current)return;
  if(inflight.current)return inflight.current;
  const generation=epoch.current;
  inflight.current=(async()=>{while(generation===epoch.current&&latest.current!==saved.current){const snapshot=latest.current;setStatus('saving');setProblem('');try{
   const response=await fetch('/api/staff/writing-draft',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({...identity,revision:revision.current,payload:JSON.parse(snapshot)})}),result=await response.json();
   if(generation!==epoch.current)return;
   if(!response.ok){if(response.status===409)conflict.current=true;throw Error(result.error||'草稿儲存失敗');}
   revision.current=result.revision;saved.current=snapshot;setStatus('saved');
  }catch(e){if(generation!==epoch.current)return;setStatus('failed');setProblem(e instanceof Error?e.message:'草稿儲存失敗');break;}}})().finally(()=>{inflight.current=null;});return inflight.current;
 }
 saveRef.current=save;
 const serialized=JSON.stringify(payload);
 useEffect(()=>{if(!ready||serialized===saved.current)return;if(conflict.current){setStatus('failed');return;}setStatus('pending');const timer=setTimeout(()=>void saveRef.current(),800);return()=>clearTimeout(timer);},[serialized,ready]);
 useEffect(()=>{const before=(event:BeforeUnloadEvent)=>{if(ready&&latest.current!==saved.current){event.preventDefault();event.returnValue='';}};const hide=()=>{if(document.visibilityState==='hidden')void saveRef.current();};window.addEventListener('beforeunload',before);document.addEventListener('visibilitychange',hide);return()=>{window.removeEventListener('beforeunload',before);document.removeEventListener('visibilitychange',hide);};},[ready]);
 return {ready,status,problem,conflict:conflict.current,save,retry:()=>ready?save():Promise.resolve(setReload(x=>x+1)),dirty:latest.current!==saved.current,canProceed:()=>ready&&!conflict.current&&latest.current===saved.current};
}
