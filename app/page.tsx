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
  code: string;
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
type Screen = "method" | "slots" | "items" | "done";
const FIXED_METHODS:Method[]=[
  {id:"",code:"video",title:"視訊諮詢",description:"25分鐘",base_price:1200},
  {id:"",code:"text",title:"文字諮詢",description:"不指定時間",base_price:0},
];
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
    [methods, setMethods] = useState<Method[]>(FIXED_METHODS),
    [items, setItems] = useState<Item[]>([]),
    [textFull, setTextFull] = useState(false),
    [method, setMethod] = useState<Method | null>(null),
    [slots, setSlots] = useState<Slot[]>([]),
    [month, setMonth] = useState(""),
    [date, setDate] = useState(""),
    [slot, setSlot] = useState(""),
    [cart, setCart] = useState<Line[]>([]),
    [modalItem, setModalItem] = useState<Item | null>(null),
    [detailItem, setDetailItem] = useState<Item | null>(null),
    [choice, setChoice] = useState<string | null>(null),
    [qty, setQty] = useState(1),
    [notice, setNotice] = useState(false),
    [videoNotice, setVideoNotice] = useState(false),
    [textConfirm, setTextConfirm] = useState(false),
    [alertMessage, setAlertMessage] = useState(""),
    [deceasedPending, setDeceasedPending] = useState<Item | null>(null),
    [noMessagePending, setNoMessagePending] = useState<Item | null>(null),
    [healthWarned, setHealthWarned] = useState(false),
    [textOk, setTextOk] = useState(false),
    [textInfoStep, setTextInfoStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [bookingNo, setBookingNo] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const cacheKey = "lin_a_sao_line_ready",
          cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const value = JSON.parse(cached);
          if (Date.now() - value.savedAt < 10 * 60 * 1000) {
            setProfile(value.profile || null);
            setAuth("ready");
          }
        }
        const remember = (value: any) =>
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ profile: value, savedAt: Date.now() }),
          );
        const requirePrimaryProfile = async () => {
          const response = await fetch("/api/my-profile", {
            cache: "no-store",
          });
          const result = await response.json();
          if (!response.ok) throw Error(result.error || "無法讀取個人資料");
          if (!result.complete) {
            location.replace("/my-profile?setup=1");
            return false;
          }
          return true;
        };
        const hasOfficialAccountFriendship = async (fallback:boolean) => {
          const liffId=process.env.NEXT_PUBLIC_LIFF_ID;
          if(!liffId)return fallback;
          try{await liff.init({liffId});if(liff.isLoggedIn()){const friendship=await liff.getFriendship();return friendship.friendFlag}}catch{}
          return fallback;
        };
        const sessionResponse=await fetch("/api/line/session",{cache:"no-store"});
        if (sessionResponse.ok) {
          const sessionProfile = await sessionResponse.json();
          if(!(await hasOfficialAccountFriendship(Boolean(sessionProfile.isFriend)))){setError("請先加入 LINE 官方帳號好友；若曾封鎖，請先解除封鎖後再進行預約。");setAuth("friend-required");return}
          setProfile(sessionProfile);
          if (!(await requirePrimaryProfile())) return;
          remember(sessionProfile);
          setAuth("ready");
          return;
        }
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
        if(!(await hasOfficialAccountFriendship(Boolean(aj.isFriend)))){setError("請先加入 LINE 官方帳號好友；若曾封鎖，請先解除封鎖後再進行預約。");setAuth("friend-required");return}
        setProfile(aj);
        if (!(await requirePrimaryProfile())) return;
        remember(aj);
        setAuth("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : "載入失敗");
        setAuth("error");
      }
    })();
  }, []);
  useEffect(() => {
    if (screen !== "slots" || method?.code !== "text" || textInfoStep < 2) return;
    const timer = window.setTimeout(() => {
      document.querySelector(`[data-text-step="${textInfoStep}"]`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [textInfoStep, screen, method?.code]);
  useEffect(() => {
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target as HTMLElement).closest(".account")) setMenu(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);
  const availableDates = useMemo(
      () =>
        new Set(
          slots
            .map((s) => dk(s.slot_start))
            .filter((d) => d >= today && d <= maxDate),
        ),
      [slots, today, maxDate],
    ),
    daySlots = slots.filter((s) => dk(s.slot_start) === date),
    phase =
      screen === "slots"
        ? 1
        : screen === "items"
          ? 2
        : screen === "done"
              ? 3
              : 0,
    total =
      (method?.base_price || 0) +
      cart.reduce((a, l) => {
        const i = items.find((x) => x.id === l.itemId),
          s = i?.sub_items.find((x) => x.id === l.subId);
        return a + (s ? s.price : i?.price || 0) * l.qty;
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
    setTextInfoStep(1);
    setSlots([]);
    setSlot("");
  }
  async function methodNext() {
    if (!method) {
      setAlertMessage("請選擇諮詢方式");
      return;
    }
    setBusy(true);
    try {
      let selected=method;
      if(!selected.id||!items.length){const catalogResponse=await fetch("/api/catalog"),catalog=await catalogResponse.json();if(!catalogResponse.ok)throw Error(catalog.error);setMethods(catalog.methods);setItems(catalog.items);setTextFull(Boolean(catalog.textFull));selected=catalog.methods.find((m:Method)=>m.code===method.code);if(!selected)throw Error("找不到諮詢方式");setMethod(selected);if(selected.code==="text"&&catalog.textFull){setAlertMessage("目前文字諮詢預約已額滿");return}}
      if(selected.code==="text"){setScreen("slots");return}
      const r = await fetch(`/api/slots?methodId=${selected.id}`),
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
      return [...current, { key, itemId: item.id, subId: null, qty: nextQty }];
    });
  }
  function add() {
    if (!modalItem) return;
    if (
      modalItem.code === "health" &&
      !healthWarned &&
      cart.some(
        (line) =>
          items.find((item) => item.id === line.itemId)?.code ===
          "overall-fortune",
      )
    ) {
      setModalItem(null);
      setHealthWarned(true);
      setAlertMessage("您選擇的整體運勢已包含身體健康，確定要再加購嗎？");
      return;
    }
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
    if (modalItem.code === "overall-fortune") {
      setAlertMessage("此項目已包含身體健康。");
    }
  }
  function addSimple(item: Item) {
    if (
      item.code === "deceased-relative" ||
      item.code === "deceased-pet"
    ) {
      setDeceasedPending(item);
      return;
    }
    if (
      item.code === "health" &&
      !healthWarned &&
      cart.some(
        (line) =>
          items.find((value) => value.id === line.itemId)?.code ===
          "overall-fortune",
      )
    ) {
      setHealthWarned(true);
      setAlertMessage("您選擇的整體運勢已包含身體健康，確定要再加購嗎？");
      return;
    }
    if (item.code === "overall-fortune") {
      changeBase(item, 1);
      setAlertMessage("此項目已包含身體健康。");
      return;
    }
    changeBase(item, 1);
  }
  function next() {
    setError("");
    if (screen === "slots") {
      if (method?.code === "text") {
        if (textInfoStep < 3) {
          setTextInfoStep((value) => value + 1);
          return;
        }
        setTextConfirm(true);
        return;
      }
      if (!slot) {
        setAlertMessage("請選擇日期與時段");
        return;
      }
      setVideoNotice(true);
    } else if (screen === "items") {
      if (!cart.length) {
        setAlertMessage("請至少選擇一個諮詢項目");
        return;
      }
      submit();
    }
  }
  function calUrl(no: string) {
    const start = new Date(slot),
      end = new Date(start.getTime() + 1500000),
      stamp = (d: Date) =>
        d
          .toISOString()
          .replace(/[-:]/g, "")
          .replace(/\.\d{3}/, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("林阿嫂視訊諮詢")}&dates=${stamp(start)}/${stamp(end)}&details=${encodeURIComponent(`預約編號：${no}`)}`;
  }
  async function submit() {
    setBusy(true);
    try {
      const r = await fetch("/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            methodId: method?.id,
            slotStart: slot || null,
            paymentMethod: "credit_card",
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
      try {
        const liffId=process.env.NEXT_PUBLIC_LIFF_ID;
        if(liffId){await liff.init({liffId});if(liff.isInClient())await liff.sendMessages([{type:"text",text:"我已送出預約，訂單待付款。"}])}
      } catch (error) {
        console.error("LIFF 用戶訊息發送失敗",error);
      }
      try {
        const notifyResponse=await fetch("/api/bookings/notify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookingNo:j.booking.booking_no})});
        if(!notifyResponse.ok)console.error("待付款 Flex 發送失敗",await notifyResponse.text());
      } catch (error) {
        console.error("待付款 Flex 發送失敗",error);
      }
      {
        const paymentResponse = await fetch("/api/ecpay", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bookingNo: j.booking.booking_no }),
          }),
          paymentResult = await paymentResponse.json();
        if (!paymentResponse.ok) throw Error(paymentResult.error);
        const form = document.createElement("form");
        form.method = "POST";
        form.action = paymentResult.action;
        Object.entries(paymentResult.fields as Record<string, string>).forEach(
          ([name, value]) => {
            const input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.value = value;
            form.appendChild(input);
          },
        );
        document.body.appendChild(form);
        form.submit();
        return;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "預約失敗");
    } finally {
      setBusy(false);
    }
  }
  const steps = ["諮詢方式", "確認時間", "諮詢項目", "進行付款"],
    stepStart = Math.max(0, Math.min(phase - 1, steps.length - 3));
  if (auth !== "ready")
    return (
      <main className="loginGate">
        <p>{auth === "loading" ? "正在確認 LINE 登入…" : error}</p>
        {auth === "friend-required"&&<a className="addLineFriend" href={process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL||"https://line.me/"}>前往加入／解除封鎖</a>}
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
              return (
                <span className="stepUnit" key={x}>
                  {offset > 0 && <i>›</i>}
                  <small
                    className={phase === i ? "active" : phase > i ? "done" : ""}
                  >
                    {x}
                  </small>
                </span>
              );
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
                <button onClick={() => (location.href = "/my-profile")}>
                  我的資料
                </button>
                <button onClick={() => (location.href = "/my-bookings")}>
                  我的預約
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className={`content screen-${screen}`}>
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
                    disabled={m.code === "text" && textFull}
                    className={method?.code === m.code ? "selected" : ""}
                    onClick={() => choose(m)}
                  >
                    <b>{m.title}</b>
                    {m.code === "video" ? (
                      <>
                        <p className="methodMeta">◷ 25分鐘</p>
                        <strong>+{money(m.base_price)}</strong>
                      </>
                    ) : (
                      <>
                        <p className="methodWarning">
                          {textFull
                            ? "目前預約已額滿"
                            : "不指定時間，請詳看下一頁說明"}
                        </p>
                        {!textFull && <small>約7–30天內收到結果</small>}
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
                <h2>
                  {method?.code === "text"
                    ? "文字諮詢流程"
                    : "選擇視訊時間"}
                </h2>
              </div>
              {method?.code === "text" ? (
                <div className="textConsultationInfo progressiveTextFlow" aria-live="polite">
                  <article data-text-step="1" className="textFlowStep active"><b>1</b><div><h3>付款完成後，依 LINE 提示提交資料</h3><p>完成付款後，我們會透過 LINE 傳送資料填寫連結；收到訊息後再點入填寫即可。</p></div></article>
                  {textInfoStep >= 2 && <article data-text-step="2" className="textFlowStep active"><b>2</b><div><h3>等待分析結果</h3><p>送單後，阿嫂老師將於 7–30 天內經由 LINE 回傳文字諮詢結果。</p></div></article>}
                  {textInfoStep >= 3 && <article data-text-step="3" className="textFlowStep active"><b>3</b><div><h3>補充提問</h3><p>收到結果後 8 小時內，可再提出 2 個補充問題。</p></div></article>}
                  <div className="textFlowProgress"><span style={{width:`${textInfoStep/3*100}%`}} /></div>
                  <small>目前顯示第 {textInfoStep} 步，共 3 步</small>
                </div>
              ) : (
                <>
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
                    <div className="bookingCalHeads">
                      {["一", "二", "三", "四", "五", "六", "日"].map((x) => (
                        <b key={x}>{x}</b>
                      ))}
                    </div>
                    <div className="bookingCalDays">
                      {calendar.map((d, i) =>
                        d ? (
                          <button
                            key={d}
                            disabled={
                              d < today || d > maxDate || !availableDates.has(d)
                            }
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
                    <article key={i.id} onClick={() => setDetailItem(i)}>
                      <div className="itemMain full">
                        <b>{i.title}</b>
                        <p>{i.description}</p>
                        <strong>{money(i.price)}</strong>
                      </div>
                      <div className="addRow">
                        {i.sub_items.length === 0 && baseQty > 0 && (
                          <button
                            className="minusButton"
                            onClick={(event) => {
                              event.stopPropagation();
                              changeBase(i, -1);
                            }}
                          >
                            −
                          </button>
                        )}
                        {i.sub_items.length === 0 && (
                          <span className="itemQty">{baseQty}</span>
                        )}
                        <button
                          className="plusButton"
                          onClick={(event) => {
                            event.stopPropagation();
                            i.sub_items.length ? openItem(i) : addSimple(i);
                          }}
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
                                <span>{s?.title}</span>
                                <b>{l.qty}</b>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCart((c) =>
                                      c.filter((x) => x.key !== l.key),
                                    );
                                  }}
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
                        ? "slots"
                        : "items",
                  )
                }
              >
                上一步
              </button>
            )}
            <button
              className="next burgundy"
              disabled={
                busy ||
                (screen === "slots" &&
                  method?.code === "video" &&
                  !availableDates.size)
              }
              onClick={screen === "method" ? methodNext : next}
            >
              {busy ? "處理中…" : screen === "items" ? "確認送出預約" : "下一步"}
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
              <button
                onClick={() => {
                  setVideoNotice(false);
                  setScreen("items");
                }}
              >
                我知道了
              </button>
            </div>
          </div>
        )}
        {alertMessage && (
          <div className="modalBackdrop">
            <div className="modal alertModal">
              <h2>提醒</h2>
              <p>{alertMessage}</p>
              <button onClick={() => setAlertMessage("")}>我知道了</button>
            </div>
          </div>
        )}
        {deceasedPending && (
          <div className="modalBackdrop">
            <div className="modal alertModal">
              <h2>預約前溫馨提醒</h2>
              <p>
                請確認
                {deceasedPending.code === "deceased-pet" ? "寵物" : "這位親友"}
                已過世半年以上再進行預約。
              </p>
              <button
                onClick={() => {
                  const item = deceasedPending;
                  setDeceasedPending(null);
                  setNoMessagePending(item);
                }}
              >
                半年以上
              </button>
              <button className="cancel" onClick={() => setDeceasedPending(null)}>未滿半年</button>
            </div>
          </div>
        )}
        {noMessagePending && (
          <div className="modalBackdrop">
            <div className="modal alertModal">
              <h2>服務內容提醒</h2>
              <p>
                本服務無帶話服務，無法與過世
                {noMessagePending.code === "deceased-pet" ? "寵物" : "親友"}
                對話或代為傳話。請確認您已了解後再繼續預約。
              </p>
              <button
                onClick={() => {
                  const item = noMessagePending;
                  setNoMessagePending(null);
                  changeBase(item, 1);
                }}
              >
                我已知道
              </button>
              <button className="cancel" onClick={() => setNoMessagePending(null)}>
                取消預約
              </button>
            </div>
          </div>
        )}
        {textConfirm && (
          <div className="modalBackdrop">
            <div className="modal importantConfirm">
              <h2>請再次確認</h2>
              <p>請先完整閱讀文字諮詢流程，確認了解資料提交、結果回傳與補充提問方式後，再繼續預約。</p>
              <button
                onClick={() => {
                  setTextConfirm(false);
                  setScreen("items");
                }}
              >
                我已詳閱並同意
              </button>
              <button className="cancel" onClick={() => setTextConfirm(false)}>
                返回閱讀
              </button>
            </div>
          </div>
        )}
        {detailItem && (
          <div className="modalBackdrop" onClick={() => setDetailItem(null)}>
            <div
              className="modal itemDetailModal"
              onClick={(event) => event.stopPropagation()}
            >
              <h2>{detailItem.title}</h2>
              <p>{detailItem.description || "目前沒有更多說明。"}</p>
              <strong>費用：{money(detailItem.price)}</strong>
              <button onClick={() => setDetailItem(null)}>關閉視窗</button>
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
                      {s.price > 0 && <b>{money(s.price)}</b>}
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
