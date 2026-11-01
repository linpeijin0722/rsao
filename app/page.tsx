"use client";
import liff from "@line/liff";
import { addCalendarDays } from "@/lib/video-booking-window";
import { useEffect, useMemo, useState } from "react";
const bookingLiffId = process.env.NEXT_PUBLIC_LIFF_ID || "2011674988-QKCQBn9L";
const officialLineUrl = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL || "https://line.me/R/ti/p/@405unxzn";
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
  tf = (v: string) => {
    const parts = new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Taipei",
      }).formatToParts(new Date(v)),
      hour = Number(parts.find((part) => part.type === "hour")?.value || 0),
      minute = parts.find((part) => part.type === "minute")?.value || "00",
      period = hour < 12 ? "上午" : hour < 13 ? "中午" : "下午",
      displayHour = hour % 12 || 12;
    return `${period} ${displayHour}:${minute}`;
  },
  taiwanToday = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
      new Date(),
    ),
  shiftMonth = (value: string, amount: number) => {
    const [y, m] = value.split("-").map(Number),
      d = new Date(Date.UTC(y, m - 1 + amount, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  },
  addMonths = (value: string, amount: number) => {
    const [y, m, d] = value.split("-").map(Number),
      x = new Date(Date.UTC(y, m - 1 + amount, d));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
  };
export default function Page() {
  const today = taiwanToday(),
    [earliestVideoDate, setEarliestVideoDate] = useState(addCalendarDays(today, 4)),
    maxDate = addMonths(today, 2),
    firstMonth = today.slice(0, 7),
    lastMonth = maxDate.slice(0, 7),
    [auth, setAuth] = useState("loading"),
    [publicBrowsing, setPublicBrowsing] = useState(false),
    [publicInfoStep, setPublicInfoStep] = useState(0),
    [publicInfoComplete, setPublicInfoComplete] = useState(false),
    [publicContactOpen, setPublicContactOpen] = useState(false),
    [publicCustomerName, setPublicCustomerName] = useState(""),
    [publicCustomerPhone, setPublicCustomerPhone] = useState(""),
    [publicTermsAccepted, setPublicTermsAccepted] = useState(false),
    [profile, setProfile] = useState<{
      pictureUrl?: string;
      full_name?: string;
    } | null>(null),
    [menu, setMenu] = useState(false),
    [screen, setScreen] = useState<Screen>("method"),
    [methods, setMethods] = useState<Method[]>(FIXED_METHODS),
    [items, setItems] = useState<Item[]>([]),
    [publicCatalogLoading, setPublicCatalogLoading] = useState(false),
    [publicCatalogError, setPublicCatalogError] = useState(""),
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
    [healthPending, setHealthPending] = useState<{item:Item;subId:string|null;qty:number}|null>(null),
    [deceasedAcknowledged, setDeceasedAcknowledged] = useState<string[]>([]),
    [healthWarned, setHealthWarned] = useState(false),
    [textOk, setTextOk] = useState(false),
    [textInfoStep, setTextInfoStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [bookingNo, setBookingNo] = useState("");
  useEffect(() => {
    if (!error) return;
    setAlertMessage(error);
    setError("");
  }, [error]);
  useEffect(() => {
    (async () => {
      try {
        if (location.pathname.replace(/\/$/, "") === "/booking") {
          setPublicBrowsing(true);
          setAuth("ready");
          return;
        }
        const liffId=bookingLiffId;
        if(liffId&&location.hostname!=="localhost"){
          await liff.init({liffId});
          const url=new URL(location.href);
          if(!liff.isInClient()){
            location.replace(officialLineUrl);
            return;
          }
          sessionStorage.setItem("lin_a_sao_verified_liff_entry","1");
          url.searchParams.delete("from");
          url.searchParams.delete("liff.state");
          history.replaceState(null,"",`${url.pathname}${url.search}${url.hash}`);
        }
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
          setProfile((current:any) => ({ ...(current || {}), ...(result.profile || {}) }));
          return true;
        };
        const hasOfficialAccountFriendship = async (fallback:boolean) => {
          const liffId=bookingLiffId;
          if(!liffId)return fallback;
          try{await liff.init({liffId});if(liff.isLoggedIn()){const friendship=await liff.getFriendship();return friendship.friendFlag}}catch{}
          return fallback;
        };
        // 切換正式 LINE Provider 後，舊站台 Cookie 可能仍保存測試 Provider 的
        // userId。從 LIFF 開啟時一律先以目前 LIFF 的 access token 更新工作階段，
        // 避免舊 Cookie 被優先採用而誤判為尚未加入正式官方帳號。
        if (bookingLiffId && liff.isLoggedIn()) {
          const accessToken = liff.getAccessToken();
          if (accessToken) {
            const authResponse = await fetch("/api/line/auth", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ accessToken }),
              }),
              authProfile = await authResponse.json();
            if (!authResponse.ok) throw Error(authProfile.error || "LINE 登入失效");
            if (!(await hasOfficialAccountFriendship(Boolean(authProfile.isFriend)))) {
              setError("請先加入 LINE 官方帳號好友；若曾封鎖，請先解除封鎖後再進行預約。");
              setAuth("friend-required");
              return;
            }
            setProfile(authProfile);
            if (!(await requirePrimaryProfile())) return;
            remember(authProfile);
            setAuth("ready");
            return;
          }
        }
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
        const id = bookingLiffId;
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
  useEffect(() => {
    if (!publicBrowsing) return;
    let active = true;
    setPublicCatalogLoading(true);
    fetch("/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        const catalog = await response.json();
        if (!response.ok) throw Error(catalog.error || "無法載入服務項目");
        if (!active) return;
        setMethods(Array.isArray(catalog.methods) ? catalog.methods : FIXED_METHODS);
        setItems(Array.isArray(catalog.items) ? catalog.items : []);
        setTextFull(Boolean(catalog.textFull));
        setPublicCatalogError("");
      })
      .catch((catalogError) => {
        if (active) setPublicCatalogError(catalogError instanceof Error ? catalogError.message : "無法載入服務項目");
      })
      .finally(() => {
        if (active) setPublicCatalogLoading(false);
      });
    return () => { active = false; };
  }, [publicBrowsing]);
  const availableDates = useMemo(
      () =>
        new Set(
          slots
            .map((s) => dk(s.slot_start))
            .filter((d) => d >= earliestVideoDate && d <= maxDate),
        ),
      [slots, earliestVideoDate, maxDate],
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
        pad = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7,
        count = new Date(Date.UTC(y, m, 0)).getUTCDate();
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
       if(!selected.id||!items.length){const catalogResponse=await fetch("/api/catalog"),catalog=await catalogResponse.json();if(!catalogResponse.ok)throw Error(catalog.error);setItems(catalog.items);setTextFull(Boolean(catalog.textFull));selected=catalog.methods.find((m:Method)=>m.code===method.code);if(!selected)throw Error("找不到諮詢方式");setMethod(selected);if(selected.code==="text"&&catalog.textFull){setAlertMessage("目前文字諮詢預約已額滿");return}}
      if(selected.code==="text"){setScreen("slots");return}
      const r = await fetch(`/api/slots?methodId=${selected.id}`),
        j = await r.json();
      if (!r.ok) throw Error(j.error);
      setEarliestVideoDate(j.earliestDate);
      const loadedSlots: Slot[] = Array.isArray(j.slots) ? j.slots : [];
      const selectableDates = loadedSlots
        .map((item) => dk(item.slot_start))
        .filter((day) => day >= j.earliestDate && day <= maxDate)
        .sort();
      setSlots(loadedSlots);
      // 當本月沒有可預約時段時，直接顯示最近一個有時段的月份。
      setMonth(selectableDates[0]?.slice(0, 7) || firstMonth);
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
      setHealthPending({item:modalItem,subId:choice&&choice!=="base"?choice:null,qty});
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
    if (modalItem.code === "overall-fortune" && !healthWarned) {
      setHealthWarned(true);
      setAlertMessage("此項目已包含身體健康。");
    }
  }
  function addSimple(item: Item) {
    if (
      item.code === "deceased-relative" ||
      item.code === "deceased-pet"
    ) {
      if(deceasedAcknowledged.includes(item.code))changeBase(item,1);
      else setDeceasedPending(item);
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
      setHealthPending({item,subId:null,qty:1});
      return;
    }
    if (item.code === "overall-fortune") {
      changeBase(item, 1);
      if (!healthWarned) {
        setHealthWarned(true);
        setAlertMessage("此項目已包含身體健康。");
      }
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
      if (publicBrowsing) setPublicContactOpen(true);
      else submit();
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
      if (publicBrowsing) {
        if (publicCustomerName.trim().length < 2) throw Error("請填寫預約人姓名");
        if (!/^09\d{8}$/.test(publicCustomerPhone)) throw Error("請填寫正確的台灣手機號碼");
        if (!publicTermsAccepted) throw Error("請先勾選同意服務條款與退款政策");
      } else {
        const liffId = bookingLiffId;
        if (!liffId) throw Error("尚未設定 LIFF ID");
        await liff.init({ liffId });
        if (!liff.isInClient() || sessionStorage.getItem("lin_a_sao_verified_liff_entry") !== "1") {
          location.replace(officialLineUrl);
          throw Error("請從 LINE 官方帳號圖文選單重新進入預約頁面。");
        }
      }
      const bookingPayload = {
        methodId: method?.id,
        slotStart: slot || null,
        paymentMethod: "credit_card",
        ...(publicBrowsing ? { publicBooking: true, customerName: publicCustomerName.trim(), customerPhone: publicCustomerPhone } : {}),
        items: cart.map((l) => ({
          item_id: l.itemId,
          quantity: l.qty,
          sub_item_ids: l.subId ? [l.subId] : [],
        })),
      };
      if(!publicBrowsing){
        const friendshipResponse=await fetch("/api/line/session",{cache:"no-store"}),friendship=await friendshipResponse.json().catch(()=>({}));
        if(!friendshipResponse.ok||!friendship.isFriend)throw Error("請先加入 LINE 官方帳號好友；若曾封鎖，請先解除封鎖後再進行預約。");
      }
      const createBooking = () => fetch("/api/bookings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(bookingPayload),
        });
      let r = await createBooking();
      if (r.status === 401 && !publicBrowsing) {
        const liffId = bookingLiffId;
        if (!liffId) throw Error("LINE 登入已失效，請重新開啟預約頁面");
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return;
        }
        const authResponse = await fetch("/api/line/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken: liff.getAccessToken() }),
        });
        if (!authResponse.ok) throw Error("LINE 登入已失效，請重新開啟預約頁面");
        r = await createBooking();
      }
      const j = await r.json();
      if (!r.ok && j.code === "SLOT_UNAVAILABLE") {
        setSlot("");setScreen("slots");
        const refreshed=await fetch(`/api/slots?methodId=${method?.id}&_=${Date.now()}`,{cache:"no-store"});
        const refreshedData=await refreshed.json();
        setSlots(refreshed.ok&&Array.isArray(refreshedData.slots)?refreshedData.slots:[]);
        if(refreshed.ok) setEarliestVideoDate(refreshedData.earliestDate);
        setAlertMessage(j.error||"此時段已被預約，請重新選擇");
        return;
      }
      if (!r.ok) throw Error(j.error);
      setBookingNo(j.booking.booking_no);
      setPublicContactOpen(false);
      try {
        const liffId=bookingLiffId;
        if(!publicBrowsing&&liffId){await liff.init({liffId});if(liff.isInClient())await liff.sendMessages([{type:"text",text:`我已送出預約，訂單待付款。姓名：${profile?.full_name || ""}`}])}
      } catch (error) {
        console.error("LIFF 用戶訊息發送失敗",error);
      }
      if(!publicBrowsing)try {
        const notifyResponse=await fetch("/api/bookings/notify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({bookingNo:j.booking.booking_no})});
        if(!notifyResponse.ok)console.error("待付款 Flex 發送失敗",await notifyResponse.text());
      } catch (error) {
        console.error("待付款 Flex 發送失敗",error);
      }
      {
        const paymentResponse = await fetch("/api/newebpay", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bookingNo: j.booking.booking_no, publicBooking: publicBrowsing }),
          }),
          paymentResult = await paymentResponse.json();
        if (!paymentResponse.ok) throw Error(paymentResult.error);
        if(paymentResult.mode==="bank_transfer"){
          location.href=`/pay?order=${encodeURIComponent(j.booking.booking_no)}`;
          return;
        }
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
        {auth === "friend-required"&&<a className="addLineFriend" href={officialLineUrl}>前往加入／解除封鎖</a>}
      </main>
    );
  return (
    <main className="shell">
      <section className={`app${publicBrowsing ? " publicBookingApp" : ""}${publicBrowsing&&!publicInfoComplete ? " publicInfoPending" : ""}`}>
        {publicBrowsing && <a className="publicLineFloat" href="https://line.me/R/ti/p/@405unxzn" target="_blank" rel="noopener noreferrer" aria-label="聯絡林阿嫂 LINE 官方帳號">
          <svg width="36" height="36" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path fill="white" d="M34 18c0-7-6.3-12-14-12S6 11 6 18c0 6.1 5.1 11.1 11.8 11.9.5.1 1.2.3 1.4.7.2.4.1 1.1.1 1.6l-.2 1.4c-.1.4-.3 1.5 1.3.8 1.7-.7 9-5.3 12.2-9.1A11 11 0 0 0 34 18Z"/><text x="20" y="21" textAnchor="middle" fill="#06c755" fontSize="9" fontWeight="800" fontFamily="Arial,sans-serif">LINE</text></svg>
          <span>LINE 客服</span>
        </a>}
        {publicBrowsing && !publicInfoComplete && <section className="publicStoreHero" aria-labelledby="public-store-title">
          <small>線上命理諮詢服務</small>
          <h1 id="public-store-title">林阿嫂線上諮詢</h1>
          <p>林阿嫂線上命理諮詢提供視訊及文字諮詢服務，包含整體運勢、感情、工作、財運、命名、擇日等項目。客戶閱讀完本頁服務資訊後，即可直接進入預約及線上付款流程，依預約時間或所示期限接受諮詢服務。</p>
          <dl><div><dt>商店地址</dt><dd>新北市林口區粉寮路二段88巷22號之一</dd></div></dl>
          <a className="publicLinePrimary" href="https://line.me/R/ti/p/@405unxzn" target="_blank" rel="noopener noreferrer">聯絡 LINE 官方客服</a>
        </section>}
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
          <div className="account" hidden={publicBrowsing}>
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
                              d < earliestVideoDate || d > maxDate || !availableDates.has(d)
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
                  {availableDates.size === 0 && (
                    <div className="videoSlotsEmpty" role="status">
                      目前所有可預約時段皆已額滿。
                    </div>
                  )}
                  {date && (
                    <div className="dayTimes">
                      <h3>{date} 可預約時段</h3>
                      <p className="taiwanTimeNotice">所有時間皆為台灣時間（UTC+8）</p>
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
        {publicBrowsing && !publicInfoComplete && <section className="publicCommerceInfo publicReviewFlow" aria-label="預約前商店與消費資訊">
          <div className="publicReviewProgress" aria-label={`閱讀進度，第${publicInfoStep+1}頁，共4頁`}><span>預約前請先閱讀</span><div>{[0,1,2,3].map(index=><i key={index} className={index<=publicInfoStep?"active":""}>{index+1}</i>)}</div><b>第 {publicInfoStep+1}／4 頁</b></div>

          {publicInfoStep===0&&<article className="publicInfoCard publicReviewPage"><div className="publicReviewBody publicPriceLinkBody"><a className="publicPriceLink" href="https://sites.google.com/view/rsao820/%E5%B8%B8%E8%A6%8B%E5%95%8F%E9%A1%8C/%E8%AB%AE%E8%A9%A2%E9%A0%85%E7%9B%AE%E8%A1%A8%E6%94%B6%E8%B2%BB%E6%A8%99%E6%BA%96" target="_blank" rel="noopener noreferrer"><b>查看諮詢項目表與收費標準</b></a></div><div className="publicSectionHeading publicProcessHeading"><small>Booking Process</small><h2>預約、付款與服務流程</h2></div><ol className="publicProcess"><li><b>查看諮詢項目</b><span>開啟上方收費標準，確認服務內容與價格。</span></li><li><b>直接進入預約</b><span>閱讀完全部說明後，在本網站直接選擇視訊或文字諮詢、服務項目與預約時間。</span></li><li><b>填寫聯絡資料</b><span>送出訂單前填寫預約人姓名及手機號碼，供訂單識別與必要聯絡使用。</span></li><li><b>確認訂單並付款</b><span>付款前會顯示服務內容、數量、預約時間與總金額；完成付款後訂單才成立。</span></li><li><b>接受線上服務</b><span>視訊諮詢依預約時間進行；文字諮詢於完整資料送出後約7–30天內完成。付款完成頁面會提供諮詢資料填寫入口。</span></li></ol></article>}

          {publicInfoStep===1&&<article className="publicInfoCard publicPolicies publicReviewPage"><div className="publicSectionHeading"><small>Cancellation &amp; Refund</small><h2>取消、改期與退款政策</h2><p>預約及付款前請完整閱讀。</p></div><div className="publicPolicyBody"><ul><li>視訊諮詢如需取消或改期，請於預約時間24小時前透過 LINE 客服提出；可免費改期一次。於服務開始前申請取消，可辦理退款。</li><li>預約時間前未提出取消或改期，且未依約上線者，因該時段已為客戶保留，原則上視同服務完成，不予退款。</li><li>文字諮詢在客戶尚未提交完整資料、老師尚未開始分析前，可申請取消及退款；開始分析後取消，將依已提供的服務比例扣除費用後退回餘額；結果已完整交付後不再受理退款。</li><li>如因本商店因素無法按約提供服務，客戶可選擇免費改期或全額退款。</li><li>如需退款，請透過 LINE 官方帳號聯絡客服並提供退款收款帳號，由客服確認訂單後以人工方式辦理退款。退款作業約7–14個工作天，實際入帳時間依金融機構作業為準。</li></ul></div></article>}

          {publicInfoStep===2&&<article className="publicInfoCard publicPolicies publicReviewPage"><div className="publicSectionHeading"><small>Service Information</small><h2>資料正確性與服務範圍</h2></div><div className="publicPolicyBody"><p>客戶應確認姓名、出生日期、時辰、諮詢對象及聯絡資料正確。因資料錯誤、不完整或後續更換諮詢對象而需重新分析時，可能需要重新預約或支付額外費用。</p><p>命理諮詢係依客戶提供的資料進行分析，內容僅供個人參考，不保證特定結果，亦不得取代醫療、心理、法律、投資或其他專業意見；客戶仍應依自身情況審慎判斷。</p></div></article>}

          {publicInfoStep===3&&<><article className="publicInfoCard publicPolicies publicReviewPage"><div className="publicSectionHeading"><small>Privacy &amp; Terms</small><h2>隱私權與服務條款</h2></div><details open><summary>個人資料使用</summary><div className="publicPolicyBody"><p>本商店為辦理預約、身分確認、付款、客服聯絡及提供諮詢服務，可能蒐集姓名、手機號碼、出生資料、諮詢內容及交易紀錄。資料僅於上述目的及依法令所需範圍內使用，不會任意提供給無關第三方。</p><p>付款資料由藍新金流及相關金融機構依其安全機制處理；本商店不會在網站中保存完整信用卡卡號。資料於服務、客服及依法保存目的消失後，將依規定刪除或停止使用。若需查詢、更正或申請刪除個人資料，請聯絡 LINE 客服。</p></div></details><details open><summary>服務條款</summary><div className="publicPolicyBody"><p>完成付款即表示客戶已確認訂單內容及同意本頁所列服務說明與政策。預約名額以付款完成時為準；未完成付款的選擇不代表時段已保留。若遇不可抗力、系統異常或其他影響服務的情況，本商店將主動聯繫並協助改期或退款。</p></div></details></article><article className="publicInfoCard publicContactCard"><div><small>Customer Service</small><h2>客服與消費爭議聯絡</h2><p>預約、付款、改期、退款或個人資料相關問題，請透過林阿嫂 LINE 官方帳號聯絡。LINE 僅作為客服管道。</p><b>LINE ID：@405unxzn</b><span>官方客服連結：line.me/R/ti/p/@405unxzn</span></div></article><p className="publicUpdatedAt">商店資訊與政策更新日期：2026年10月27日</p></>}

          <div className="publicReviewActions">{publicInfoStep>0&&<button className="back" onClick={()=>{setPublicInfoStep(value=>Math.max(0,value-1));window.scrollTo({top:0,behavior:"smooth"})}}>上一頁</button>}<button className="next burgundy" onClick={()=>{if(publicInfoStep<3)setPublicInfoStep(value=>value+1);else setPublicInfoComplete(true);window.scrollTo({top:0,behavior:"smooth"})}}>{publicInfoStep<3?"已閱讀，下一頁":"我已閱讀，開始預約"}</button></div>
        </section>}
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
        {publicContactOpen&&<div className="modalBackdrop"><div className="modal publicContactModal"><h2>填寫預約聯絡資料</h2><p>請填寫可聯絡的真實資料，送出後將直接建立訂單並前往付款。</p><label>預約人姓名<input autoFocus value={publicCustomerName} onChange={event=>setPublicCustomerName(event.target.value)} maxLength={80} placeholder="請輸入姓名" autoComplete="name"/></label><label>手機號碼<input value={publicCustomerPhone} onChange={event=>setPublicCustomerPhone(event.target.value.replace(/\D/g,"").slice(0,10))} inputMode="numeric" maxLength={10} placeholder="例如：0912345678" autoComplete="tel"/></label><label className="publicTermsCheck"><input type="checkbox" checked={publicTermsAccepted} onChange={event=>setPublicTermsAccepted(event.target.checked)}/><span>我已閱讀並同意本頁的服務條款、取消改期與退款政策及隱私權說明。</span></label><button disabled={busy} onClick={()=>void submit()}>{busy?"正在建立訂單…":"確認資料並前往付款"}</button><button className="cancel" disabled={busy} onClick={()=>setPublicContactOpen(false)}>返回修改項目</button></div></div>}
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
        {healthPending && (
          <div className="modalBackdrop">
            <div className="modal alertModal">
              <h2>加購提醒</h2>
              <p>您選擇的整體運勢已包含身體健康，確定要再加購嗎？</p>
              <button onClick={()=>{const pending=healthPending,key=pending.item.id+":"+(pending.subId||"base");setCart(current=>{const old=current.find(line=>line.key===key);return old?current.map(line=>line.key===key?{...line,qty:line.qty+pending.qty}:line):[...current,{key,itemId:pending.item.id,subId:pending.subId,qty:pending.qty}]});setHealthWarned(true);setHealthPending(null);setModalItem(null);setError("")}}>確定加購</button>
              <button className="cancel" onClick={()=>setHealthPending(null)}>取消</button>
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
                  setDeceasedAcknowledged(current=>current.includes(item.code)?current:[...current,item.code]);
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
