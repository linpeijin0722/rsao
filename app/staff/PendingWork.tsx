"use client";
import { useEffect, useState, type ReactNode } from "react";
import { pendingBookings, resultReturnedAt, type PendingKind } from "@/lib/staff-pending";
import { parseTaipeiDateTime } from "@/lib/taipei-time";
import "./pending-work.css";

const format = (value: string | number) => new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(typeof value === "number" ? new Date(value) : parseTaipeiDateTime(value));

export function ResultReturnStatus({ booking, warning }: { booking: any; warning?: string }) {
  const value = resultReturnedAt(booking);
  return <div className={`resultReturnStatus ${value ? "done" : "waiting"}`}>
    <strong>{value ? "已回傳" : warning ? "待確認" : "尚未回傳"}</strong>
    {value ? <><time dateTime={value}>{format(value)}</time><small>{booking.consultation_result_returned_at ? "系統發送時間" : "資料夾首次偵測時間"}</small></> : warning ? <small>資料夾暫時無法確認</small> : <small>尚無回傳紀錄</small>}
  </div>;
}

const categories: { kind: PendingKind; title: string; description: string }[] = [
  { kind: "video", title: "視訊待補資料", description: "視訊日前 7 天起仍未收到資料；已過視訊時間的未處理訂單也會保留。" },
  { kind: "text", title: "文字待補資料", description: "付款隔天中午 12:00 起，仍未收到問事資料。" },
  { kind: "result", title: "結果待回傳", description: "收到問事資料已滿 15 天，尚無結果回傳紀錄。手動收件以註記時間起算。" },
];
export default function PendingWork({ bookings, onSubmission, onViewData, documentActions, onRefresh, warning, loading }: {
  bookings: any[]; onSubmission: (booking: any) => void; onViewData: (booking: any) => void;
  documentActions: (booking: any) => ReactNode; onRefresh: () => Promise<void>; warning: string; loading: boolean;
}) {
  const [kind, setKind] = useState<PendingKind>("video");
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const all = pendingBookings(bookings, now), entries = all.filter(entry => entry.kind === kind);
  return <section className="pendingWork" aria-labelledby="pending-work-title" aria-busy={loading}>
    <header><div><h2 id="pending-work-title">待處理區 <span>{all.length} 筆</span></h2><p>依台灣時間判斷・完成處理並更新後自動移出</p></div>
      <button type="button" disabled={loading} onClick={() => void onRefresh()}>{loading ? "更新中…" : "重新整理狀態"}</button></header>
    <div className="pendingWorkTabs" role="group" aria-label="待處理類型">{categories.map(category =>
      <button type="button" key={category.kind} aria-pressed={kind === category.kind} onClick={() => setKind(category.kind)}>
        {category.title}<b>{all.filter(entry => entry.kind === category.kind).length}</b>
      </button>)}</div>
    <p className="pendingWorkRule">{categories.find(category => category.kind === kind)?.description}</p>
    {warning && <p className="pendingWorkWarning" role="status">{warning}。結果待回傳清單暫供核對，請確認資料夾後再聯繫客人。</p>}
    <div className="pendingWorkList">{entries.map(({ booking, dueAt }) => <article key={booking.id}>
      <div className="pendingWorkPerson"><strong>{booking.customers?.line_display_name || booking.customers?.full_name || "未填姓名"}</strong>
        {booking.customers?.full_name && <span>{booking.customers.full_name}</span>}<small>{booking.booking_no}</small></div>
      <div className="pendingWorkTiming"><b>{kind === "video" ? `視訊時間：${format(booking.slot_start)}` : kind === "text" ? `付款時間：${format(booking.paid_at)}` : `資料收到：${format(booking.data_submitted_at)}`}</b>
        <span>{kind === "result" ? "滿 15 天" : "列入待處理"}：{format(dueAt)}</span>
        {kind === "video" && parseTaipeiDateTime(booking.slot_start).getTime() < now && <em>已過視訊時間，仍待補資料</em>}</div>
      <div className="pendingWorkActions">{kind === "result" ? <><button type="button" onClick={() => onViewData(booking)}>查看填寫資料</button>{documentActions(booking)}</> : <button type="button" onClick={() => onSubmission(booking)}>處理資料回傳</button>}</div>
    </article>)}</div>
    {!entries.length && <p className="pendingWorkEmpty">{loading ? "正在更新訂單與回傳狀態…" : "此類目前沒有待處理訂單"}</p>}
  </section>;
}
