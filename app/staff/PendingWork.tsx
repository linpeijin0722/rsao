"use client";
import { useEffect, useState, type ReactNode } from "react";
import { pendingBookings, resultReturnedAt, type PendingKind } from "@/lib/staff-pending";
import { parseTaipeiDateTime } from "@/lib/taipei-time";
import "./pending-work.css";

const format = (value: string | number) => new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
}).format(typeof value === "number" ? new Date(value) : parseTaipeiDateTime(value));

export function ResultReturnStatus({ booking, warning, onManual, busy }: { booking: any; warning?: string; onManual?: (booking: any) => void; busy?: boolean }) {
  const value = resultReturnedAt(booking);
  return <div className={`resultReturnStatus ${value ? "done" : "waiting"}`}>
    <strong>{value ? booking.consultation_result_manual_at && !booking.consultation_result_returned_at ? "已手動回傳諮詢結果" : "已回傳" : warning ? "待確認" : "尚未回傳"}</strong>
    {value ? <><time dateTime={value}>{format(value)}</time><small>{booking.consultation_result_returned_at ? "系統發送時間" : booking.consultation_result_manual_at ? "手動註記時間" : "資料夾首次偵測時間"}</small></> : warning ? <small>資料夾暫時無法確認</small> : <small>尚無回傳紀錄</small>}
    {!value && onManual && booking.payment_status === "paid" && !["cancelled","canceled","expired","refunded"].includes(booking.status) && <button type="button" disabled={busy} onClick={() => onManual(booking)}>{busy ? "儲存中…" : "已手動回傳諮詢結果"}</button>}
  </div>;
}

const categories: { kind: PendingKind; title: string; description: string }[] = [
  { kind: "video", title: "視訊待補資料", description: "視訊日前 7 天起仍未收到資料；已過視訊時間的未處理訂單也會保留。" },
  { kind: "text", title: "文字待補資料", description: "付款隔天中午 12:00 起，仍未收到問事資料。" },
  { kind: "result", title: "結果待回傳", description: "收到問事資料已滿 14 天，尚無結果回傳紀錄。手動收件以註記時間起算。" },
];
export default function PendingWork({ bookings, submissionStatus, onManualResult, manualBusy, onViewUser, documentActions, onRefresh, warning, loading }: {
  bookings: any[]; submissionStatus: (booking: any) => ReactNode; onManualResult: (booking: any) => void; manualBusy: boolean;
  onViewUser: (booking: any) => void;
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
    <div className="pendingWorkList">
      {!!entries.length && <div className="pendingWorkColumns" aria-hidden="true"><b>用戶</b><b>{kind === "result" ? "等待天數" : "待處理時間"}</b><b>資料回傳</b><b>訂單編號</b><b>諮詢單／結果回傳</b></div>}
      {entries.map(({ booking, dueAt }) => <article key={booking.id}>
      <button type="button" className="customerButton pendingWorkPerson" onClick={() => onViewUser(booking)} title="查看用戶資料">
        {booking.customers?.line_picture_url && <img src={booking.customers.line_picture_url} alt=""/>}
        <span>{[booking.customers?.line_display_name, booking.customers?.full_name].filter(Boolean).join("｜") || "未填姓名"}</span>
      </button>
      <div className="pendingWorkTiming"><b className={kind === "result" ? "pendingWorkDays" : undefined}>{kind === "video" ? `視訊時間：${format(booking.slot_start)}` : kind === "text" ? `付款時間：${format(booking.paid_at)}` : `收到資料後第 ${Math.max(0, Math.floor((now - parseTaipeiDateTime(booking.data_submitted_at).getTime()) / 86400000))} 天`}</b>
        {kind !== "result" && <span>列入待處理：{format(dueAt)}</span>}
        {kind === "video" && parseTaipeiDateTime(booking.slot_start).getTime() < now && <em>已過視訊時間，仍待補資料</em>}</div>
      <div className="pendingWorkSubmission">{submissionStatus(booking)}</div>
      <div className="pendingWorkOrder"><small>{booking.booking_no}</small></div>
      <div className="pendingWorkActions">{kind === "result" ? <>{documentActions(booking)}<button type="button" disabled={manualBusy} onClick={() => onManualResult(booking)}>已手動回傳諮詢結果</button></> : <span>—</span>}</div>
    </article>)}</div>
    {!entries.length && <p className="pendingWorkEmpty">{loading ? "正在更新訂單與回傳狀態…" : "此類目前沒有待處理訂單"}</p>}
  </section>;
}
