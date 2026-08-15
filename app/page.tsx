"use client";
import liff from "@line/liff";
import { useEffect, useMemo, useState } from "react";
type Method = {
  id: string;
  code: "video" | "text";
  title: string;
  description: string | null;
  base_price: number;
};
type Sub = {
  id: string;
  title: string;
  price: number;
};
type Item = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  option_mode: string;
  sub_items: Sub[];
};
type Slot = {
  slot_start: string;
};
type Line = {
  key: string;
  itemId: string;
  subId: string | null;
  qty: number;
};
type Screen = "method" | "slots" | "items" | "payment" | "done";
const money = (v: number) =>
    new Intl.NumberFormat("zh-TW", {
      style: "currency",
      currency: "TWD",
      maximumFractionDigits: 0,
    }).format(v),
  dk = (v: string) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
      new Date(v),
    ),
  tf = (v: string) =>
    new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Taipei",
    }).format(new Date(v)),
  taiwanToday = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
      new Date(),
    ),
  shiftMonth = (value: string, amount: number) => {
    const [y, m] = value.split("-").map(Number),
      d = new Date(y, m - 1 + amount, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  },
  addMonths = (value: string, amount: number) => {
    const [y, m, d] = value.split("-").map(Number),
      x = new Date(y, m - 1 + amount, d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  };
export default function Page() {
  const today = taiwanToday(),
    maxDate = addMonths(today, 2),
    firstMonth = today.slice(0, 7),
    lastMonth = maxDate.slice(0, 7),
    [auth, setAuth] = useState("loading"),
    [profile, setProfile] = useState<{
      pictureUrl?: string;
    } | null>(null),
    [menu, setMenu] = useState(false),
    [screen, setScreen] = useState<Screen>("method"),
    [methods, setMethods] = useState<Method[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [method, setMethod] = useState<Method | null>(null),
    [slots, setSlots] = useState<Slot[]>([]),
    [month, setMonth] = useState(""),
    [date, setDate] = useState(""),
    [slot, setSlot] = useState(""),
    [cart, setCart] = useState<Line[]>([]),
    [modalItem, setModalItem] = useState<Item | null>(null),
    [choice, setChoice] = useState<string | null>(null),
    [qty, setQty] = useState(1),
    [notice, setNotice] = useState(false),
    [videoNotice, setVideoNotice] = useState(false),
    [textOk, setTextOk] = useState(false),
    [payment, setPayment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [bookingNo, setBookingNo] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const id = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!id) throw Error("尚未設定 LIFF ID");
        await liff.init({ liffId: id });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return;
        }
        const ar = await fetch("/api/line/auth", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ accessToken: liff.getAccessToken() }),
          }),
          aj = await ar.json();
        if (!ar.ok) throw Error(aj.error);
        setProfile(aj);
        const r = await fetch("/api/catalog"),
          j = await r.json();
        if (!r.ok) throw Error(j.error);
        setMethods(j.methods);
        setItems(j.items);
        setAuth("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
        setAuth("error");
      }
    })();
  }, []);
  const availableDates = useMemo(
      () =>
        new Set(
          slots.map((s) => dk(s.slot_start)).filter((d) => d >= today && d <= maxDate),
        ),
      [slots, today, maxDate],
    ),
    daySlots = slots.filter((s) => dk(s.slot_start) === date),
    phase =
      screen === "slots"
        ? 1
        : screen === "items"
          ? 2
          : screen === "payment"
            ? 3
            : screen === "done"
              ? 4
              : 0,
    total =
      (method?.base_price || 0) +
      cart.reduce((a, l) => {
        const i = items.find((x) => x.id === l.itemId),
          s = i?.sub_items.find((x) => x.id === l.subId);
        return a + ((i?.price || 0) + (s?.price || 0)) * l.qty;
      }, 0),
    calendar = useMemo(() => {
      if (!month) return [];
      const [y, m] = month.split("-").map(Number),
        pad = (new Date(y, m - 1, 1).getDay() + 6) % 7,
        count = new Date(y, m, 0).getDate();
      return [
        ...Array(pad).fill(null),
        ...Array.from(
          { length: count },
          (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
        ),
      ];
    }, [month]);
  function choose(m: Method) {
    setMethod(m);
    setTextOk(false);
    setSlots([]);
    setSlot("");
    if (m.code === "text") setNotice(true);
  }
  async function methodNext() {
    if (!method) return setError("請選擇諮詢方式");
    if (method.code === "text") {
      if (!textOk) return setNotice(true);
      setScreen("items");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`/api/slots?methodId=${method.id}`),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setSlots(j.slots);
        setMonth(firstMonth);
      setScreen("slots");
    } catch (e) {
      setError(e instanceof Error ? e.message : "無法讀取時段");
    } finally {
      setBusy(false);
    }
  }
  function openItem(i: Item) {
    setModalItem(i);
    setChoice(i.option_mode === "single_required" ? null : "base");
    setQty(1);
  }
  function changeBase(item: Item, amount: number) {
    const key = `${item.id}:base`;
    setCart((current) => {
      const old = current.find((line) => line.key === key);
      const nextQty = Math.max(0, (old?.qty || 0) + amount);
      if (!nextQty) return current.filter((line) => line.key !== key);
      if (old)
        return current.map((line) =>
          line.key === key ? { ...line, qty: nextQty } : line,
        );
      return [
        ...current,
        { key, itemId: item.id, subId: null, qty: nextQty },
      ];
    });
  }
  function add() {
    if (!modalItem) return;
    if (modalItem.option_mode === "single_required" && !choice)
      return setError("請選擇一個子項目");
    const subId = choice && choice !== "base" ? choice : null,
      key = `${modalItem.id}:${subId || "base"}`;
    setCart((c) => {
      const old = c.find((x) => x.key === key);
      return old
        ? c.map((x) => (x.key === key ? { ...x, qty: x.qty + qty } : x))
        : [...c, { key, itemId: modalItem.id, subId, qty }];
    });
    setModalItem(null);
    setError("");
  }
  function next() {
    setError("");
    if (screen === "slots") {
      if (!slot) return setError("請選擇日期與時段");
      setVideoNotice(true);
    } else if (screen === "items") {
      if (!cart.length) return setError("請至少選擇一個諮詢項目");
      setScreen("payment");
    } else if (screen === "payment") {
      if (!payment) return setError("請選擇付款方式");
      submit();
    }
  }
  function calUrl(no: string) {
    const start = new Date(slot),
      end = new Date(start.getTime() + 1800000),
      stamp = (d: Date) =>
        d
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("林阿嫂視訊諮詢")}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(`預約編號：${no}`)}`;
  }
  async function submit() {
    setBusy(true);
    const cal =
      method?.code === "video" ? window.open("about:blank", "_blank") : null;
    try {
      const r = await fetch("/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            methodId: method?.id,
            slotStart: slot || null,
            paymentMethod: payment,
            items: cart.map((l) => ({
              item_id: l.itemId,
              quantity: l.qty,
              sub_item_ids: l.subId ? [l.subId] : [],
            })),
          }),
        }),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setBookingNo(j.booking.booking_no);
      setScreen("done");
      if (cal) cal.location.href = calUrl(j.booking.booking_no);
    } catch (e) {
      cal?.close();
      setError(e instanceof Error ? e.message : "預約失敗");
    } finally {
      setBusy(false);
    }
  }
  const steps = ["諮詢方式", "確認時間", "諮詢項目", "付款方式", "進行付款"],
    stepStart = Math.max(0, Math.min(phase - 1, steps.length - 3));
  if (auth !== "ready")
    return (
      <main className="loginGate">
        <h1>林阿嫂線上諮詢預約</h1>
        <p>{auth === "loading" ? "正在確認 LINE 登入…" : error}</p>
      </main>
    );
  return (
    <main className="shell">
      <section className="app">
        <nav className="stepBar">
          <div className="stepTrail">
            {stepStart > 0 && <i className="stepLead">›</i>}
            {steps.slice(stepStart, stepStart + 3).map((x, offset) => {
              const i = stepStart + offset;
              return <span className="stepUnit" key={x}>
                {offset > 0 && <i>›</i>}
                <small className={phase === i ? "active" : phase > i ? "done" : ""}>
                  {x}
                </small>
              </span>;
            })}
            {stepStart + 3 < steps.length && <i className="stepMore">…</i>}
          </div>
          <div className="account">
            <button onClick={() => setMenu(!menu)}>
              {profile?.pictureUrl ? (
                <img src={profile.pictureUrl} alt="我的帳號" />
              ) : (
                "我"
              )}
            </button>
            {menu && (
              <div className="accountMenu">
                <button onClick={() => alert("我的預約功能即將開放")}>
                  我的預約
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="bookingBrand">
          <h1>林阿嫂線上諮詢預約系統</h1>
          <p>✓ 已通過 LINE 登入驗證</p>
        </div>
        <div className="content">
          {error && <div className="error">{error}</div>}
          {screen === "method" && (
            <>
              <div className="title">
                <h2>選擇諮詢方式</h2>
              </div>
              <div className="methodCards big">
                {methods.map((m) => (
                  <button
                    key={m.id}
                    className={method?.id === m.id ? "selected" : ""}
                    onClick={() => choose(m)}
                  >
                    <b>{m.title}</b>
                    {m.code === "video" ? (
                      <>
                        <p className="methodMeta">◷ 30分鐘</p>
                        <strong>+{money(m.base_price)}</strong>
                      </>
                    ) : (
                      <>
                        <p className="methodWarning">不指定時間，請詳看下一頁說明</p>
                        <small>約7–30天內收到結果</small>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
          {screen === "slots" && (
            <>
              <div className="title">
                <h2>選擇視訊時間</h2>
              </div>
              <div className="bookingCalendar">
                <div className="monthNav">
                  <button
                    disabled={month <= firstMonth}
                    onClick={() => {
                      setMonth(shiftMonth(month, -1));
                      setDate("");
                      setSlot("");
                    }}
                  >
                    ‹
                  </button>
                  <b>{month.replace("-", " 年 ")} 月</b>
                  <button
                    disabled={month >= lastMonth}
                    onClick={() => {
                      setMonth(shiftMonth(month, 1));
                      setDate("");
                      setSlot("");
                    }}
                  >
                    ›
                  </button>
                </div>
                <div className="calHeads">
                  {["一", "二", "三", "四", "五", "六", "日"].map((x) => (
                    <b key={x}>{x}</b>
                  ))}
                </div>
                <div className="calDays">
                  {calendar.map((d, i) =>
                    d ? (
                      <button
                        key={d}
                        disabled={d < today || d > maxDate || !availableDates.has(d)}
                        className={`${availableDates.has(d) ? "available" : "unavailable"} ${date === d ? "selected" : ""}`}
                        onClick={() => {
                          setDate(d);
                          setSlot("");
                        }}
                      >
                        {Number(d.slice(-2))}
                      </button>
                    ) : (
                      <span key={i} />
                    ),
                  )}
                </div>
              </div>
              {date && (
                <div className="dayTimes">
                  <h3>{date} 可預約時段</h3>
                  <div className="times">
                    {daySlots.map((s) => (
                      <button
                        key={s.slot_start}
                        className={slot === s.slot_start ? "selected" : ""}
                        onClick={() => setSlot(s.slot_start)}
                      >
                        {tf(s.slot_start)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {screen === "items" && (
            <>
              <div className="title">
                <h2>選擇諮詢項目</h2>
              </div>
              <div className="items cartItems">
                {items.map((i) => {
                  const lines = cart.filter((l) => l.itemId === i.id),
                    baseQty = lines
                      .filter((l) => !l.subId)
                      .reduce((a, l) => a + l.qty, 0),
                    subLines = lines.filter((l) => l.subId);
                  return (
                    <article key={i.id}>
                      <div className="itemMain full">
                        <b>{i.title}</b>
                        <p>{i.description}</p>
                        <strong>{money(i.price)}</strong>
                      </div>
                      <div className="addRow">
                        {i.sub_items.length === 0 && baseQty > 0 && (
                          <button className="minusButton" onClick={() => changeBase(i, -1)}>−</button>
                        )}
                        {i.sub_items.length === 0 && <span className="itemQty">{baseQty}</span>}
                        <button
                          className="plusButton"
                          onClick={() => i.sub_items.length ? openItem(i) : changeBase(i, 1)}
                        >
                          ＋
                        </button>
                      </div>
                      {subLines.length > 0 && (
                        <div className="cartPreview">
                          {subLines.map((l) => {
                            const s = i.sub_items.find((x) => x.id === l.subId);
                            return (
                              <div key={l.key}>
                                <span>
                                  {i.title}　{s?.title}
                                </span>
                                <b>{l.qty}</b>
                                <button
                                  onClick={() =>
                                    setCart((c) =>
                                      c.filter((x) => x.key !== l.key),
                                    )
                                  }
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="total">
                <span>合計</span>
                <b>{money(total)}</b>
              </div>
            </>
          )}
          {screen === "payment" && (
            <>
              <div className="title">
                <h2>選擇付款方式</h2>
              </div>
              <div className="payments">
                {[
                  ["credit_card", "信用卡"],
                  ["transfer", "銀行轉帳"],
                  ["line_pay", "LINE Pay"],
                ].map(([v, t]) => (
                  <button
                    key={v}
                    className={payment === v ? "selected" : ""}
                    onClick={() => setPayment(v)}
                  >
                    <b>{t}</b>
                    <span>›</span>
                  </button>
                ))}
              </div>
              <div className="summary">
                <p>
                  <span>付款金額</span>
                  <strong>{money(total)}</strong>
                </p>
              </div>
            </>
          )}
          {screen === "done" && (
            <div className="success">
              <div>✓</div>
              <h2>預約已送出</h2>
              <strong>{bookingNo}</strong>
              {method?.code === "video" && (
                <a
                  className="calendarLink"
                  href={calUrl(bookingNo)}
                  target="_blank"
                >
                  加入 Google 行事曆
                </a>
              )}
            </div>
          )}
        </div>
        {screen !== "done" && (
          <footer>
            {screen !== "method" && (
              <button
                className="back"
                onClick={() =>
                  setScreen(
                    screen === "slots"
                      ? "method"
                      : screen === "items"
                        ? method?.code === "video"
                          ? "slots"
                          : "method"
                        : "items",
                  )
                }
              >
                上一步
              </button>
            )}
            <button
              className="next burgundy"
              disabled={busy || (screen === "slots" && !availableDates.size)}
              onClick={screen === "method" ? methodNext : next}
            >
              {busy ? "處理中…" : screen === "payment" ? "確認預約" : "下一步"}
            </button>
          </footer>
        )}
        {notice && (
          <div className="modalBackdrop">
            <div className="modal">
              <h2>文字諮詢說明</h2>
              <ul>
                <li>約7–30天內收到諮詢結果。</li>
                <li>確認資料時，每項預約可提出3個問題。</li>
                <li>收到結果後8小時內，每項預約可提出2個補充問題。</li>
              </ul>
              <button
                onClick={() => {
                  setTextOk(true);
                  setNotice(false);
                }}
              >
                我已了解
              </button>
            </div>
          </div>
        )}
        {videoNotice && (
          <div className="modalBackdrop">
            <div className="modal reminderModal">
              <h2>▣ 視訊諮詢預約提醒</h2>
              <p>我們會在時間到時主動發送通話邀請給您，請留意訊息通知。</p>
              <div className="reminderNote">
                <b>視訊後補充問題注意事項</b>
                <span>須於預約時段後 8 小時內提出。</span>
              </div>
              <button onClick={() => { setVideoNotice(false); setScreen("items"); }}>我知道了</button>
            </div>
          </div>
        )}
        {modalItem && (
          <div className="modalBackdrop">
            <div className="modal cartModal">
              <h2>{modalItem.title}</h2>
              {modalItem.sub_items.length > 0 && (
                <div className="optionList">
                  {modalItem.option_mode !== "single_required" && (
                    <button
                      className={choice === "base" ? "selected" : ""}
                      onClick={() => setChoice("base")}
                    >
                      不選子項目
                    </button>
                  )}
                  {modalItem.sub_items.map((s) => (
                    <button
                      key={s.id}
                      className={choice === s.id ? "selected" : ""}
                      onClick={() => setChoice(s.id)}
                    >
                      <span>{s.title}</span>
                      {s.price > 0 && <b>+{money(s.price)}</b>}
                    </button>
                  ))}
                </div>
              )}
              <div className="qty">
                <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
                <b>{qty}</b>
                <button onClick={() => setQty(qty + 1)}>＋</button>
              </div>
              <button className="confirmAdd" onClick={add}>
                加入
              </button>
              <button className="cancel" onClick={() => setModalItem(null)}>
                取消
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
