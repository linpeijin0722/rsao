"use client";
import { useEffect, useMemo, useRef } from "react";
import { consultationIssueRanges } from "@/lib/consultation-polish";

type Issue = { originalText: string; action: string; restored?: boolean };
export default function ConsultationIssueEditor({ value, issues, focusRequest, onChange, onDone }: {
  value: string; issues: Issue[]; focusRequest?: { index: number; nonce: number } | null;
  onChange: (value: string) => void; onDone: () => void;
}) {
  const container=useRef<HTMLDivElement>(null);
  const done=useRef(onDone);done.current=onDone;
  useEffect(()=>{const outside=(event:Event)=>{const target=event.target;if(target instanceof Element&&!container.current?.contains(target)&&!target.closest(".returnPolishReview"))done.current()};document.addEventListener("pointerdown",outside,true);document.addEventListener("focusin",outside);return()=>{document.removeEventListener("pointerdown",outside,true);document.removeEventListener("focusin",outside)}},[]);
  const input = useRef<HTMLTextAreaElement>(null), backdrop = useRef<HTMLPreElement>(null);
  const ranges = useMemo(() => consultationIssueRanges(value, issues), [value, issues]);
  const latest = useRef(ranges); latest.current = ranges;
  const syncScroll = () => { if (input.current && backdrop.current) { backdrop.current.scrollTop = input.current.scrollTop; backdrop.current.scrollLeft = input.current.scrollLeft; } };
  useEffect(() => {
    const editor = input.current;
    if (!editor) return;
    editor.focus({ preventScroll: true });
    const range = latest.current.find(entry => entry.issueIndex === focusRequest?.index);
    if (!range) return;
    editor.setSelectionRange(range.start, range.end);
    const mark = backdrop.current?.querySelector<HTMLElement>(`[data-issue="${range.issueIndex}"]`);
    if (mark && backdrop.current) editor.scrollTop = Math.max(0, mark.offsetTop - backdrop.current.offsetTop - editor.clientHeight / 3);
    syncScroll();
    editor.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusRequest]);
  let cursor = 0;
  const pieces = ranges.flatMap(range => { const before = value.slice(cursor, range.start); cursor = range.end; return [before, <mark key={`${range.start}:${range.issueIndex}`} data-issue={range.issueIndex}>{value.slice(range.start, range.end)}</mark>]; });
  return <div ref={container} className="consultationIssueEditor">
    <div className="consultationIssueEditorLayers">
      <pre ref={backdrop} aria-hidden="true">{pieces}{value.slice(cursor)}{"\n"}</pre>
      <textarea ref={input} aria-label="編輯回傳內容（保留疑似錯誤標示）" value={value} onChange={event => onChange(event.target.value)} onScroll={syncScroll} />
    </div>

  </div>;
}
