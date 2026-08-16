"use client";
import { useEffect, useMemo, useState } from "react";
export default function Staff() {
  const [password, setPassword] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [items, setItems] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(null),
    [editTime, setEditTime] = useState(""),
    [editItems, setEditItems] = useState<string[]>([]),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch("/api/staff/bookings"),
      j = await r.json();
    if (r.ok) setRows(j.bookings);
    else setError(j.error);
  }
  useEffect(() => {
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((j) => setItems(j.items || []));
  }, []);
  function openEdit(x: any) {
    setEditing(x);
    setEditItems((x.booking_details || []).map((d: any) => d.item_id));
    setEditTime(
      x.slot_start
        ? new Date(
            new Date(x.slot_start).getTime() -
              new Date(x.slot_start).getTimezoneOffset() * 60000,
          )
            .toISOString()
            .slice(0, 16)
        : "",
    );
  }
  async function saveEdit() {
    const r = await fetch("/api/staff/bookings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingNo: editing.booking_no,
        slotStart: editTime || null,
        itemIds: editItems,
      }),
    });
    if (r.ok) {
      setEditing(null);
      load();
      alert("已儲存並發送 LINE 變更通知");
    } else alert((await r.json()).error);
  }
  useEffect(() => {
    load();
  }, []);
  async function login() {
    const r = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) {
      setError("");
      load();
    } else setError("密碼錯誤");
  }
  async function remind(no: string) {
    const r = await fetch("/api/staff/remind", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: no }),
    });
    alert(r.ok ? "已發送提醒" : "發送失敗");
  }
  const video = useMemo(
      () => rows.filter((x) => x.consultation_methods?.code === "video"),
      [rows],
    ),
    text = useMemo(
      () =>
        rows
          .filter((x) => x.consultation_methods?.code === "text")
          .sort((a, b) =>
            String(b.paid_at || b.created_at).localeCompare(
              String(a.paid_at || a.created_at),
            ),
          ),
      [rows],
    );
  if (error === "未登入")
    return (
      <main className="staffLogin">
        <h1>預約工作後台</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密碼"
        />
        <button onClick={login}>登入</button>
      </main>
    );
  return (
    <main className="staffPage">
      <h1>預約工作後台</h1>
      {error && <div className="error">{error}</div>}
      <section>
        <h2>視訊預約月曆</h2>
        <div className="videoCalendar">
          {video.map((x) => (
            <article key={x.id}>
              <b>
                {x.slot_start
                  ? new Date(x.slot_start).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                    })
                  : "未選時間"}
              </b>
              <span>{x.booking_no}</span>
              <small>{x.customers?.line_display_name}</small>
              <button onClick={() => openEdit(x)}>修改預約</button>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h2>文字諮詢（依付款時間）</h2>
        <div className="staffTable">
          {text.map((x) => {
            const complete = x.booking_details?.every(
              (d: any) => d.booking_detail_profiles?.length,
            );
            return (
              <article key={x.id}>
                <b>{x.booking_no}</b>
                <span>{x.customers?.line_display_name}</span>
                <span>
                  {x.payment_status === "paid" ? "已付款" : "未付款"}／
                  {x.payment_method}
                </span>
                <span>{complete ? "資料已回傳" : "資料未回傳"}</span>
                {!complete && (
                  <button onClick={() => remind(x.booking_no)}>
                    提醒填寫資料
                  </button>
                )}
                <button onClick={() => openEdit(x)}>修改</button>
              </article>
            );
          })}
        </div>
      </section>
      {editing && (
        <div className="modalBackdrop">
          <div className="modal">
            <h2>修改 {editing.booking_no}</h2>
            {editing.consultation_methods?.code === "video" && (
              <label>
                預約時間
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </label>
            )}
            <h3>諮詢項目</h3>
            <div className="staffItemChoices">
              {items.map((i) => (
                <label key={i.id}>
                  <input
                    type="checkbox"
                    checked={editItems.includes(i.id)}
                    onChange={(e) =>
                      setEditItems(
                        e.target.checked
                          ? [...editItems, i.id]
                          : editItems.filter((id) => id !== i.id),
                      )
                    }
                  />
                  {i.title}
                </label>
              ))}
            </div>
            <button onClick={saveEdit}>儲存並發送 LINE 通知</button>
            <button className="cancel" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
