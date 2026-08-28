"use client";
import { useEffect, useState } from "react";
const status = (x: any) =>
  x.status === "cancelled"
    ? x.cancellation_reason === "自行取消"
      ? "已取消"
      : "已失效"
    : x.payment_status === "paid"
      ? "已付款"
      : "待付款";
const complete = (x: any) => Boolean(x.data_submitted_at);
const cleanSubItemTitle = (value: unknown) =>
  String(value || "")
    .replace(/^(兩位嬰靈[（(]含[）)]以上).*/u, "$1")
    .replace(/\s+/g, " ")
    .trim();
const itemText = (detail: any) => {
  const subs = detail.booking_detail_sub_items?.map((x: any) => cleanSubItemTitle(x.sub_item_title)).filter(Boolean) || [];
  return `${detail.item_title}${subs.length ? `－${subs.join("、")}` : ""}${detail.quantity > 1 ? ` × ${detail.quantity}` : ""}`;
};
const bookingTime = (value: string) => {
  const date = new Date(value), weekdayName=new Intl.DateTimeFormat("en-US", {timeZone:"Asia/Taipei",weekday:"long"}).format(date), weekday=({Sunday:"日",Monday:"一",Tuesday:"二",Wednesday:"三",Thursday:"四",Friday:"五",Saturday:"六"} as Record<string,string>)[weekdayName]||"";
  const parts = new Intl.DateTimeFormat("zh-TW", {timeZone:"Asia/Taipei",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"2-digit",hour12:true}).formatToParts(date), get=(type:string)=>parts.find(p=>p.type===type)?.value||"";
  return `${get("year")}/${get("month")}/${get("day")}(${weekday})${get("dayPeriod")}${get("hour")}:${get("minute")}`;
};
export default function Mine() {
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const load = () =>
    fetch("/api/my-bookings").then(async (r) => {
      const j = await r.json();
      if (r.ok) {
        setRows(j.bookings);
        const order = new URLSearchParams(location.search).get("order");
        if (order) setSelected(j.bookings.find((x: any) => x.booking_no === order) || null);
      } else setError(j.error);
      setLoading(false);
    });
  useEffect(() => {
    void load();
  }, []);
  async function pay(no: string) {
    const r = await fetch("/api/ecpay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bookingNo: no }),
      }),
      j = await r.json();
    if (!r.ok) return setError(j.error);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = j.action;
    Object.entries(j.fields as Record<string, string>).forEach(
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
  }
  async function cancel(no: string) {
    const current = rows.find((x) => x.booking_no === no), paid = current?.payment_status === "paid";
    if (paid) return setError("已付款的預約無法自行取消，如需調整請聯絡 LINE 助理");
    if (!confirm("確定取消這筆預約？")) return;
    const response = await fetch("/api/my-bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: no }),
    });
    if (!response.ok) return setError((await response.json()).error);
    setSelected(null);
    load();
  }
  if (selected) {
    const x = selected,
      missing = x.payment_status === "paid" && !complete(x);
    return (
      <main className="dataPage minePage mineDetail">
        <button className="mineBack" onClick={() => setSelected(null)}>
          ‹ 返回所有預約
        </button>
        <section>
          <div className="mineDetailTop">
            <div>
              <span className={`methodTag ${x.consultation_methods?.code}`}>{x.consultation_methods?.code === "video" ? "視訊諮詢" : "文字諮詢"}</span>
              <h1>{status(x)}</h1>
            </div>
            <b>NT$ {Number(x.total_price).toLocaleString()}</b>
          </div>
          {missing && (
            <div className="importantDataAlert">
              <h2>尚未填寫諮詢者資料</h2>
              <p>
                這是完成預約非常重要的步驟。填完資料後，我們才能送交老師觀靈，您才能收到算命結果。
              </p>
              <a
                href={`/booking-data?order=${encodeURIComponent(x.booking_no)}`}
              >
                立即填寫資料（必填）
              </a>
            </div>
          )}
          <div className="mineInfoGrid">
            <div>
              <small>訂單編號</small>
              <b>{x.booking_no}</b>
            </div>
            {x.slot_start && (
              <div>
                <small>預約時間</small>
                <b>
                  {new Date(x.slot_start).toLocaleString("zh-TW", {
                    timeZone: "Asia/Taipei",
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
              </div>
            )}
            <div>
              <small>付款方式</small>
              <b>
                {x.payment_status === "paid"
                  ? x.payment_method === "credit_card"
                    ? "信用卡"
                    : "轉帳"
                  : "尚未付款"}
              </b>
            </div>
          </div>
          <h2 className="mineItemsTitle">預約項目</h2>
          <div className="mineItems">
            {x.booking_details?.map((d: any, i: number) => (
              <span key={i}>{itemText(d)}</span>
            ))}
          </div>
          {x.status === "cancelled" && (
            <div className="expiredReason">
              <b>原因</b>
              <p>{x.cancellation_reason || "預約已取消"}</p>
            </div>
          )}
          {x.status !== "cancelled" && x.payment_status !== "paid" && (
            <div className="mineActions">
              <button onClick={() => (location.href = `/pay?order=${encodeURIComponent(x.booking_no)}`)}>繼續付款</button>
              <button onClick={() => cancel(x.booking_no)}>取消預約</button>
            </div>
          )}
          {x.payment_status === "paid" &&
            !missing &&
            x.status !== "cancelled" && (
              <a
                href={`/booking-data?order=${encodeURIComponent(x.booking_no)}`}
              >
                查看諮詢者資料
              </a>
            )}
        </section>
      </main>
    );
  }
  return (
    <main className="dataPage minePage mineOverview">
      <div className="minePageHeader"><button onClick={() => (location.href = "/")}>‹</button><h1>我的預約</h1></div>
      {error && <div className="error">{error}</div>}
      {loading && <p className="mineLoading">載入中，請稍後10～20秒…</p>}
      {!loading && !rows.length && !error && <p className="emptyHint">目前沒有預約紀錄</p>}
      <div className="mineList">
        {rows.map((x: any) => {
          const date = new Date(x.slot_start || x.paid_at || x.created_at),
            missing = x.payment_status === "paid" && !complete(x),
            isVideo = x.consultation_methods?.code === "video";
          return (
            <button
              className="mineSummary"
              key={x.booking_no}
              onClick={() => setSelected(x)}
            >
              <span className="mineSummaryLeft"><span className={`mineMethodBlock ${isVideo ? "video" : "text"}`}>{isVideo ? <>視訊<br/>諮詢</> : <>文字<br/>諮詢</>}</span><span className={`mineStatus ${status(x) === "已付款" ? "paid" : status(x) === "待付款" ? "pending" : "expired"}`}>{status(x)}</span></span>
              <span className="mineSummaryBody">
                <span className={`mineSummaryTime ${isVideo ? "video" : "text"}`}>
                  {isVideo ? <>視訊時間：<br/><b>{bookingTime(x.slot_start)}</b></> : <>訂單時間：{date.toLocaleDateString("zh-TW", {timeZone:"Asia/Taipei",year:"numeric",month:"numeric",day:"numeric"})}</>}
                </span>
                <small className="mineSummaryItems">
                  {x.booking_details?.map(itemText).join("、")}
                </small>
                <span className="mineSummaryStates">{missing ? <strong>！尚未填寫諮詢者資料</strong> : x.payment_status === "paid" && <span className="mineDataComplete">✓ 已填寫諮詢者資料</span>}</span>
              </span>
              <span className="mineArrow">›</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
