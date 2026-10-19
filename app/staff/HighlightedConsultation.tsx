"use client";
import {useEffect,useMemo,useRef} from 'react';
import {consultationIssueRanges} from '@/lib/consultation-polish';
type Issue={originalText:string;action:string;restored?:boolean};
export default function HighlightedConsultation({content,issues,focusRequest}:{content:string;issues:Issue[];focusRequest?:{index:number;nonce:number}|null}){
 const root=useRef<HTMLPreElement>(null),ranges=useMemo(()=>consultationIssueRanges(content,issues),[content,issues]);
 useEffect(()=>{if(!focusRequest)return;const target=root.current?.querySelector<HTMLElement>(`[data-issue="${focusRequest.index}"]`);target?.scrollIntoView({behavior:'smooth',block:'center'});target?.focus({preventScroll:true});},[focusRequest,ranges]);
 let cursor=0;const pieces=ranges.flatMap(range=>{const before=content.slice(cursor,range.start);cursor=range.end;return[before,<mark tabIndex={-1} data-issue={range.issueIndex} key={`${range.issueIndex}:${range.start}`} className={focusRequest?.index===range.issueIndex?'consultationIssueHighlight focused':'consultationIssueHighlight'} title="疑似錯誤，請人工確認">{content.slice(range.start,range.end)}</mark>]});
 return <pre ref={root} className="highlightedConsultationText">{pieces}{content.slice(cursor)}</pre>;
}
