"use client";
import { useEffect, useMemo, useState } from "react";
const key = (v: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date(v),
  );
export default function Staff() {
  const [password, setPassword] = useState(""),
    [rows, setRows] = useState<any[]>([]),
    [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [selectedDate, setSelectedDate] = useState(""),
    [editing, setEditing] = useState<any>(null),
    [userView, setUserView] = useState<any>(null),
    [dataView, setDataView] = useState<any[]>([]),
    [editTime, setEditTime] = useState(""),
    [editLines, setEditLines] = useState<any[]>([]);
  async function load() {
    const r = await fetch("/api/staff/bookings"),
      j = await r.json();
    r.ok ? setRows(j.bookings) : setError(j.error);
  }
  useEffect(() => {
    load();
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((j) => setItems(j.items || []));
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
      () =>
        rows.filter(
          (x) =>
            x.consultation_methods?.code === "video" &&
            x.status !== "cancelled",
        ),
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
    ),
    bookedDates = new Set(
      video.filter((x) => x.slot_start).map((x) => key(x.slot_start)),
    ),
    daily = video.filter(
      (x) => x.slot_start && key(x.slot_start) === selectedDate,
    ),
    cal = useMemo(() => {
      const [y, m] = month.split("-").map(Number),
        pad = (new Date(y, m - 1, 1).getDay() + 6) % 7,
        n = new Date(y, m, 0).getDate();
      return [
        ...Array(pad).fill(null),
        ...Array.from(
          { length: n },
          (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
        ),
      ];
    }, [month]);
  function openEdit(x: any) {
    setEditing(x);
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
    setEditLines(
      (x.booking_details || []).map((d: any) => ({
        itemId: d.item_id,
        subId: d.booking_detail_sub_items?.[0]?.sub_item_id || "",
        qty: d.quantity || 1,
      })),
    );
  }
  function qty(itemId: string, amount: number) {
    setEditLines((v) => {
      const old = v.find((x) => x.itemId === itemId);
      if (!old && amount > 0) return [...v, { itemId, subId: "", qty: 1 }];
      if (!old) return v;
      const n = old.qty + amount;
      return n < 1
        ? v.filter((x) => x.itemId !== itemId)
        : v.map((x) => (x.itemId === itemId ? { ...x, qty: n } : x));
    });
  }
  async function saveEdit() {
    if (!editLines.length) return alert("請至少選擇一個項目");
    if (
      editLines.some(
        (l) =>
          items.find((i) => i.id === l.itemId)?.sub_items?.length && !l.subId,
      )
    )
      return alert("請完成子項目選擇");
    const r = await fetch("/api/staff/bookings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingNo: editing.booking_no,
        slotStart: editTime || null,
        lines: editLines,
      }),
    });
    if (r.ok) {
      setEditing(null);
      load();
      alert("已儲存並發送 LINE 變更通知");
    } else alert((await r.json()).error);
  }
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
        <div className="staffMonthNav">
          <button
            onClick={() => {
              const [y, m] = month.split("-").map(Number);
              setMonth(new Date(y, m - 2, 1).toISOString().slice(0, 7));
              setSelectedDate("");
            }}
          >
            ‹
          </button>
          <b>{month.replace("-", " 年 ")} 月</b>
          <button
            onClick={() => {
              const [y, m] = month.split("-").map(Number);
              setMonth(new Date(y, m, 1).toISOString().slice(0, 7));
              setSelectedDate("");
            }}
          >
            ›
          </button>
        </div>
        <div className="staffCalendar">
          <div className="staffWeek">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <b key={d}>{d}</b>
            ))}
          </div>
          <div className="staffDays">
            {cal.map((d, i) =>
              d ? (
                <button
                  key={d}
                  disabled={!bookedDates.has(d)}
                  className={`${bookedDates.has(d) ? "booked" : "empty"} ${selectedDate === d ? "selected" : ""}`}
                  onClick={() => setSelectedDate(d)}
                >
                  {Number(d.slice(-2))}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </div>
        {selectedDate && (
          <div className="dailyBookings">
            <h3>{selectedDate} 的預約</h3>
            {daily.map((x) => {
              const complete = x.booking_details?.every(
                  (d: any) => d.booking_detail_profiles?.length,
                ),
                paid = x.payment_status === "paid",
                status =
                  x.status === "cancelled"
                    ? x.cancellation_reason === "自行取消"
                      ? "已取消"
                      : "已失效"
                    : paid
                      ? "已付款"
                      : "未付款",
                profiles = x.booking_details.flatMap(
                  (d: any) =>
                    d.booking_detail_profiles
                      ?.map((p: any) => p.consultation_profiles)
                      .filter(Boolean) || [],
                );
              return (
                <article className="dailyBookingRow" key={x.id}>
                  <b>
                    {new Date(x.slot_start).toLocaleTimeString("zh-TW", {
                      timeZone: "Asia/Taipei",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </b>
                  <button
                    className="customerButton"
                    onClick={() => setUserView(x.customers)}
                  >
                    {x.customers?.line_picture_url && (
                      <img src={x.customers.line_picture_url} alt="" />
                    )}
                    <span>{x.customers?.line_display_name}</span>
                  </button>
                  <span className="statusBadge">{status}</span>
                  {paid &&
                    (complete ? (
                      <button onClick={() => setDataView(profiles)}>
                        已回傳資料
                      </button>
                    ) : (
                      <button onClick={() => remind(x.booking_no)}>
                        未回傳資料・通知
                      </button>
                    ))}
                  <small>{x.booking_no}</small>
                  <button onClick={() => openEdit(x)}>修改</button>
                </article>
              );
            })}
          </div>
        )}
      </section>
      {userView && (
        <div className="modalBackdrop" onClick={() => setUserView(null)}>
          <div
            className="modal userInfoModal"
            onClick={(e) => e.stopPropagation()}
          >
            {userView.line_picture_url && (
              <img src={userView.line_picture_url} alt="" />
            )}
            <h2>{userView.line_display_name}</h2>
            <p>LINE UID</p>
            <code>{userView.line_user_id}</code>
            <button onClick={() => setUserView(null)}>關閉</button>
          </div>
        </div>
      )}
      {dataView.length > 0 && (
        <div className="modalBackdrop" onClick={() => setDataView([])}>
          <div
            className="modal returnedDataModal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>已回傳的諮詢者資料</h2>
            {dataView.map((p: any, i: number) => (
              <article key={p.id || i}>
                <b>
                  {p.relationship}－{p.name}
                </b>
                <p>
                  {p.gender}　{p.birth_date}　{p.birth_shichen || p.birth_time}
                </p>
                <p>農曆：{p.lunar_birth_text || "未填"}</p>
                {p.notes && <p>{p.notes}</p>}
              </article>
            ))}
            <button onClick={() => setDataView([])}>關閉</button>
          </div>
        </div>
      )}
      <section>
        <h2>文字諮詢（依付款時間）</h2>
        <div className="staffTable">
          {text.map((x) => {
            const complete = x.booking_details?.every(
              (d: any) => d.booking_detail_profiles?.length,
            );
            return (
              <article key={x.id} onClick={() => openEdit(x)}>
                <b>{x.customers?.line_display_name}</b>
                <span>{x.booking_no}</span>
                <span>
                  {x.payment_status === "paid" ? "已付款" : "未付款"}／
                  {x.payment_method}
                </span>
                <span>
                  {x.payment_status === "paid"
                    ? complete
                      ? "資料已回傳"
                      : "資料未回傳"
                    : "—"}
                </span>
                {x.payment_status === "paid" && !complete && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      remind(x.booking_no);
                    }}
                  >
                    提醒填寫資料
                  </button>
                )}
              </article>
            );
          })}
        </div>
      </section>
      {editing && (
        <div className="modalBackdrop">
          <div className="modal staffEditModal">
            <header>
              {editing.customers?.line_picture_url ? (
                <img src={editing.customers.line_picture_url} alt="LINE頭像" />
              ) : (
                <div className="avatarFallback">LINE</div>
              )}
              <div>
                <h2>{editing.customers?.line_display_name || "LINE 用戶"}</h2>
                <p>{editing.booking_no}</p>
              </div>
            </header>
            <div className="bookingStatus">
              <b>{editing.payment_status === "paid" ? "已付款" : "未付款"}</b>
              {editing.payment_status === "paid" && (
                <b>
                  {editing.booking_details?.every(
                    (d: any) => d.booking_detail_profiles?.length,
                  )
                    ? "諮詢者資料已填"
                    : "諮詢者資料未填"}
                </b>
              )}
            </div>
            {editing.payment_status === "paid" &&
              !editing.booking_details?.every(
                (d: any) => d.booking_detail_profiles?.length,
              ) && (
                <button
                  className="remindButton"
                  onClick={() => remind(editing.booking_no)}
                >
                  通知客人填寫資料
                </button>
              )}
            {editing.consultation_methods?.code === "video" && (
              <label className="editTime">
                預約時間
                <input
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                />
              </label>
            )}
            <h3>修改諮詢項目與數量</h3>
            <div className="staffEditItems">
              {items.map((i) => {
                const line = editLines.find((x) => x.itemId === i.id);
                return (
                  <article key={i.id}>
                    <div>
                      <b>{i.title}</b>
                      {line && i.sub_items?.length > 0 && (
                        <select
                          value={line.subId}
                          onChange={(e) =>
                            setEditLines((v) =>
                              v.map((x) =>
                                x.itemId === i.id
                                  ? { ...x, subId: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="">請選子項目</option>
                          {i.sub_items.map((s: any) => (
                            <option key={s.id} value={s.id}>
                              {s.title}　NT$ {s.price}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="staffQty">
                      <button onClick={() => qty(i.id, -1)}>−</button>
                      <b>{line?.qty || 0}</b>
                      <button onClick={() => qty(i.id, 1)}>＋</button>
                    </div>
                  </article>
                );
              })}
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
