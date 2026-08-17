"use client";
import { useEffect, useMemo, useState } from "react";
const key = (v: string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
    new Date(v),
  );
const shiftMonth = (value: string, amount: number) => {
  const [year, month] = value.split("-").map(Number),
    serial = year * 12 + month - 1 + amount;
  return `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
};
const asArray = (value: any): any[] =>
  Array.isArray(value) ? value : value ? [value] : [];
const isComplete = (x: any) => Boolean(x.data_submitted_at);
const returnedData = (x: any) =>
  asArray(x.booking_details).flatMap((detail: any) =>
    asArray(detail.booking_consultation_answers).flatMap((answer: any) => {
      const direct = asArray(answer.consultation_profiles);
      const participants = asArray(answer.booking_answer_participants)
        .sort((a: any, b: any) => Number(a.position || 0) - Number(b.position || 0))
        .flatMap((participant: any) => asArray(participant.consultation_profiles));
      const profiles = [...direct, ...participants].filter(
        (profile: any, index: number, all: any[]) =>
          profile && all.findIndex((candidate: any) => candidate?.id === profile.id) === index,
      );
      return profiles.map((profile: any) => ({
        ...profile,
        answerId: answer.id,
        questions: asArray(answer.questions),
        extra_data: answer.extra_data || {},
        item_title: detail.item_title,
        sub_items: asArray(detail.booking_detail_sub_items).map((sub: any) => sub.sub_item_title).filter(Boolean),
      }));
    }),
  );
const statusKey = (x: any) =>
  x.status === "cancelled"
    ? x.cancellation_reason === "自行取消"
      ? "cancelled"
      : "expired"
    : x.payment_status === "paid"
      ? "paid"
      : "pending";
const statusText = (x: any) =>
  ({
    paid: "已付款",
    pending: "待付款",
    cancelled: "已取消",
    expired: "已失效",
  })[statusKey(x)];
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
    [editLines, setEditLines] = useState<any[]>([]),
    [statusFilter, setStatusFilter] = useState("all"),
    [dataFilter, setDataFilter] = useState("all"),
    [sortBy, setSortBy] = useState("paid_time"),
    [rememberPassword, setRememberPassword] = useState(false),
    [addPicker, setAddPicker] = useState<any>(null),
    [pickedSubId, setPickedSubId] = useState("");
  async function load() {
    const r = await fetch("/api/staff/bookings"),
      j = await r.json();
    r.ok ? setRows(j.bookings) : setError(j.error);
  }
  useEffect(() => {
    const saved=localStorage.getItem("lin_a_sao_staff_password");if(saved){setPassword(saved);setRememberPassword(true)}
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
      if(rememberPassword)localStorage.setItem("lin_a_sao_staff_password",password);else localStorage.removeItem("lin_a_sao_staff_password");
      setError("");
      load();
    } else setError("密碼錯誤");
  }
  async function remind(no: string, customer?: any) {
    if(customer&&!confirm(`是否確定發送 LINE 通知 ${customer.line_display_name || "LINE 用戶"} (${customer.full_name || "尚未填寫姓名"}) 填寫資料？`))return;
    const r = await fetch("/api/staff/remind", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: no }),
    });
    alert(r.ok ? "已發送提醒" : "發送失敗");
  }
  async function markPaid(no: string) {
    if (!confirm("確定已收到這筆款項，並將訂單標記為已付款嗎？")) return;
    const r = await fetch("/api/staff/bookings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingNo: no, action: "mark_paid" }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "設定失敗");
    setEditing(null); await load(); alert("已標記為手動收款");
  }
  async function editReturned(profile: any) {
    const name=prompt("姓名",profile.name||""); if(name===null)return;
    const relationship_detail=prompt("他是我的…",profile.relationship_detail||""); if(relationship_detail===null)return;
    const notes=prompt("備註",profile.notes||""); if(notes===null)return;
    const r=await fetch("/api/staff/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"update_consultation_profile",profileId:profile.id,profile:{...profile,name,relationship_detail,notes},questions:profile.questions||[]})});
    const j=await r.json(); if(!r.ok)return alert(j.error||"儲存失敗"); alert("資料已更新");setDataView([]);await load();
  }
  const filtered = useMemo(() => {
      const result = rows.filter((x) => {
        if (statusFilter !== "all" && statusKey(x) !== statusFilter)
          return false;
        if (dataFilter !== "all") {
          if (x.payment_status !== "paid") return false;
          if (dataFilter === "returned" && !isComplete(x)) return false;
          if (dataFilter === "missing" && isComplete(x)) return false;
        }
        return true;
      });
      return result.sort((a, b) => {
        const av =
            sortBy === "reservation_time"
              ? a.slot_start || a.paid_at || a.created_at
              : a.paid_at || a.created_at,
          bv =
            sortBy === "reservation_time"
              ? b.slot_start || b.paid_at || b.created_at
              : b.paid_at || b.created_at;
        return String(bv).localeCompare(String(av));
      });
    }, [rows, statusFilter, dataFilter, sortBy]),
    video = useMemo(
      () =>
        rows.filter(
          (x) =>
            x.consultation_methods?.code === "video" &&
            x.status !== "cancelled",
        ),
      [rows],
    ),
    text = useMemo(
      () => filtered.filter((x) => x.consultation_methods?.code === "text"),
      [filtered],
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
        lineKey: d.id,
        itemId: d.item_id,
        subId: d.booking_detail_sub_items?.[0]?.sub_item_id || "",
        qty: d.quantity || 1,
      })),
    );
  }
  function qty(itemId: string, amount: number, lineKey?: string) {
    setEditLines((v) => {
      const old = lineKey
        ? v.find((x) => x.lineKey === lineKey)
        : v.find((x) => x.itemId === itemId && !x.subId);
      if (!old && amount > 0)
        return [
          ...v,
          { lineKey: crypto.randomUUID(), itemId, subId: "", qty: 1 },
        ];
      if (!old) return v;
      const n = old.qty + amount;
      return n < 1
        ? v.filter((x) => x.lineKey !== old.lineKey)
        : v.map((x) => (x.lineKey === old.lineKey ? { ...x, qty: n } : x));
    });
  }
  function startAdd(item: any) {
    if (!item.sub_items?.length) return qty(item.id, 1);
    setPickedSubId("");
    setAddPicker(item);
  }
  function confirmAdd() {
    if (!pickedSubId) return alert("請先選擇子項目");
    setEditLines((value) => {
      const old = value.find(
        (line) => line.itemId === addPicker.id && line.subId === pickedSubId,
      );
      return old
        ? value.map((line) =>
            line.lineKey === old.lineKey
              ? { ...line, subId: pickedSubId, qty: line.qty + 1 }
              : line,
          )
        : [
            ...value,
            {
              lineKey: crypto.randomUUID(),
              itemId: addPicker.id,
              subId: pickedSubId,
              qty: 1,
            },
          ];
    });
    setAddPicker(null);
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
      <main className="adminLogin staffLogin"><div>
        <h1>預約工作後台</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="管理密碼"
        />
        <label className="rememberStaff"><input type="checkbox" checked={rememberPassword} onChange={e=>setRememberPassword(e.target.checked)}/> 記住我的密碼</label><button onClick={login}>登入</button></div>
      </main>
    );
  return (
    <main className="staffPage">
      <h1>預約工作後台</h1>
      {error && <div className="error">{error}</div>}
      <section className="staffBookingSection videoBookingSection">
        <h2 className="staffSectionTitle">視訊預約</h2>
        <div className="staffMonthNav">
          <button
            onClick={() => {
              setMonth(shiftMonth(month, -1));
              setSelectedDate("");
            }}
          >
            ‹
          </button>
          <b>{month.replace("-", " 年 ")} 月</b>
          <button
            onClick={() => {
              setMonth(shiftMonth(month, 1));
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
            <div className="staffBookingTable">
              <div className="staffTableHead">
                <b>視訊時間</b>
                <b>用戶</b>
                <b>付款狀態</b>
                <b>資料回傳</b>
                <b>訂單編號</b>
                <b>操作</b>
              </div>
              {daily.map((x) => {
                const complete = isComplete(x),
                  paid = x.payment_status === "paid",
                  status = statusText(x),
                  profiles = returnedData(x);
                return (
                  <article className="staffTableRow" key={x.id}>
                    <span>
                      {new Date(x.slot_start).toLocaleTimeString("zh-TW", {
                        timeZone: "Asia/Taipei",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <button
                      className="customerButton"
                      onClick={() => setUserView(x.customers)}
                    >
                      {x.customers?.line_picture_url && (
                        <img src={x.customers.line_picture_url} alt="" />
                      )}
                      <span>{x.customers?.line_display_name}</span>
                    </button>
                    <b className={`staffState ${statusKey(x)}`}>{paid && x.collection_source === "manual" ? "手動收款" : status}</b>
                    {paid ? (
                      complete ? (
                        <button
                          className="returned"
                          onClick={() => setDataView(profiles)}
                        >
                          已回傳
                        </button>
                      ) : (
                        <button
                          className="missing"
                          onClick={() => remind(x.booking_no,x.customers)}
                        >
                          尚未回傳
                        </button>
                      )
                    ) : (
                      <span>—</span>
                    )}
                    <small>{x.booking_no}</small>
                    <button onClick={() => openEdit(x)}>修改</button>
                  </article>
                );
              })}
            </div>
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
            <div className="staffCustomerProfile">
              <div><span>姓名</span><b>{userView.full_name || "尚未填寫"}</b></div>
              <div><span>性別</span><b>{userView.gender || "尚未填寫"}</b></div>
              <div><span>地址</span><b>{userView.full_address || "尚未填寫"}</b></div>
              <div><span>國曆生日</span><b>{userView.birth_date || "尚未填寫"}</b></div>
              <div><span>農曆生日</span><b>{userView.lunar_birth_text || "尚未填寫"}</b></div>
              <div><span>生肖</span><b>{userView.zodiac || "尚未填寫"}</b></div>
              <div><span>出生時辰</span><b>{userView.birth_shichen || "尚未填寫"}</b></div>
            </div>
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
                <p>農曆：{p.lunar_birth_text || "未填"}</p>{p.item_title&&<p><b>項目：{p.item_title}{p.sub_items?.length ? `－${p.sub_items.join("、")}` : ""}</b></p>}{p.questions?.filter(Boolean).map((q:string,n:number)=><p key={n}>問題 {n+1}：{q}</p>)}
                {p.extra_data && Object.keys(p.extra_data).length > 0 && <div className="staffExtraData">{Object.entries(p.extra_data).map(([label,value])=><p key={label}><b>{label}：</b>{typeof value === "object" ? JSON.stringify(value) : String(value || "未填")}</p>)}</div>}
                {p.notes && <p>{p.notes}</p>}<button onClick={()=>void editReturned(p)}>編輯這筆資料</button>
              </article>
            ))}
            <button onClick={() => setDataView([])}>關閉</button>
          </div>
        </div>
      )}
      <section className="staffBookingSection textBookingSection">
        <h2 className="staffSectionTitle">文字預約</h2>
        <div className="staffFilters">
          <label>
            訂單狀態
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="paid">已付款</option>
              <option value="pending">待付款</option>
              <option value="cancelled">已取消</option>
              <option value="expired">已失效</option>
            </select>
          </label>
          <label>
            資料回傳
            <select
              value={dataFilter}
              onChange={(e) => setDataFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="returned">已回傳</option>
              <option value="missing">尚未回傳</option>
            </select>
          </label>
          <label>
            排序
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="paid_time">付款時間</option>
              <option value="reservation_time">預約時間</option>
            </select>
          </label>
        </div>
        <div className="staffBookingTable">
          <div className="staffTableHead">
            <b>付款時間</b>
            <b>用戶</b>
            <b>付款狀態</b>
            <b>資料回傳</b>
            <b>訂單編號</b>
            <b>操作</b>
          </div>
          {text.map((x) => {
            const complete = isComplete(x),
              paid = x.payment_status === "paid";
            return (
              <article className="staffTableRow" key={x.id}>
                <span>
                  {new Date(x.paid_at || x.created_at).toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                  })}
                </span>
                <button
                  className="customerButton"
                  onClick={() => setUserView(x.customers)}
                >
                  {x.customers?.line_picture_url && (
                    <img src={x.customers.line_picture_url} alt="" />
                  )}
                  <span>{x.customers?.line_display_name}</span>
                </button>
                <b className={`staffState ${statusKey(x)}`}>{paid && x.collection_source === "manual" ? "手動收款" : statusText(x)}</b>
                {paid ? (
                  complete ? (
                    <button
                      className="returned"
                      onClick={() =>
                        setDataView(
                          returnedData(x),
                        )
                      }
                    >
                      已回傳
                    </button>
                  ) : (
                    <button
                      className="missing"
                      onClick={() => remind(x.booking_no,x.customers)}
                    >
                      尚未回傳
                    </button>
                  )
                ) : (
                  <span>—</span>
                )}
                <small>{x.booking_no}</small>
                <button onClick={() => openEdit(x)}>修改</button>
              </article>
            );
          })}
        </div>
      </section>
      {editing && (
        <div className="modalBackdrop" onClick={() => setEditing(null)}>
          <div
            className="modal staffEditModal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="staffModalClose"
              aria-label="關閉"
              onClick={() => setEditing(null)}
            >
              ×
            </button>
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
              <b>{editing.payment_status === "paid" ? (editing.collection_source === "manual" ? "手動收款" : "已付款") : "未付款"}</b>
              {editing.payment_status === "paid" && (
                <b>
                  {isComplete(editing)
                    ? "諮詢者資料已填"
                    : "諮詢者資料未填"}
                </b>
              )}
            </div>
            {editing.payment_status !== "paid" && editing.status !== "cancelled" && <button className="manualPaidButton" onClick={() => markPaid(editing.booking_no)}>設為已付款（手動收款）</button>}
            {editing.payment_status === "paid" &&
              !isComplete(editing) && (
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
            <div className="staffEditColumns">
              <section className="staffCurrentItems">
                <h3>目前已有項目</h3>
                {editLines.map((line) => {
                  const i = items.find((item) => item.id === line.itemId);
                  if (!i) return null;
                  return (
                    <article key={line.lineKey}>
                      <div>
                        <b>{i.title}</b>
                        {i.sub_items?.length > 0 && (
                          <select
                            value={line.subId}
                            onChange={(e) =>
                              setEditLines((v) =>
                                v.map((x) =>
                                  x.lineKey === line.lineKey
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
                        <button onClick={() => qty(i.id, -1, line.lineKey)}>
                          −
                        </button>
                        <b>{line.qty}</b>
                        <button onClick={() => qty(i.id, 1, line.lineKey)}>
                          ＋
                        </button>
                        <button
                          className="removeLine"
                          onClick={() =>
                            setEditLines((v) =>
                              v.filter((x) => x.lineKey !== line.lineKey),
                            )
                          }
                        >
                          刪除
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!editLines.length && <p className="emptyHint">尚未選擇項目</p>}
              </section>
              <section className="staffCatalogItems">
                <h3>新增諮詢項目</h3>
                {items.map((i) => {
                  return (
                    <article key={i.id}>
                      <b>{i.title}</b>
                      <button
                        className="staffAddButton"
                        onClick={() => startAdd(i)}
                      >
                        ＋
                      </button>
                    </article>
                  );
                })}
              </section>
            </div>
            <button onClick={saveEdit}>儲存並發送 LINE 通知</button>
            <button className="cancel" onClick={() => setEditing(null)}>
              取消
            </button>
          </div>
        </div>
      )}
      {addPicker && (
        <div
          className="modalBackdrop addSubBackdrop"
          onClick={() => setAddPicker(null)}
        >
          <div
            className="modal staffSubPicker"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="staffModalClose"
              aria-label="關閉"
              onClick={() => setAddPicker(null)}
            >
              ×
            </button>
            <h2>{addPicker.title}</h2>
            <p>請選擇子項目</p>
            <div className="staffSubOptions">
              {addPicker.sub_items.map((sub: any) => (
                <button
                  key={sub.id}
                  className={pickedSubId === sub.id ? "selected" : ""}
                  onClick={() => setPickedSubId(sub.id)}
                >
                  <b>{sub.title}</b>
                  <span>NT$ {Number(sub.price).toLocaleString()}</span>
                </button>
              ))}
            </div>
            <button className="confirmSubAdd" onClick={confirmAdd}>
              確認加入
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
