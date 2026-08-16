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
const complete = (x: any) =>
  Boolean(x.booking_details?.length) &&
  x.booking_details.every((d: any) => d.booking_detail_profiles?.length);
const itemText = (detail: any) => {
  const subs = detail.booking_detail_sub_items?.map((x: any) => x.sub_item_title).filter(Boolean) || [];
  return `${detail.item_title}${subs.length ? `－${subs.join("、")}` : ""}${detail.quantity > 1 ? ` × ${detail.quantity}` : ""}`;
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
    if (!confirm(paid ? "確定取消這筆已付款預約？取消後請聯絡客服確認退款事宜。" : "確定取消這筆預約？")) return;
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
              <button onClick={() => pay(x.booking_no)}>繼續付款</button>
              <button onClick={() => cancel(x.booking_no)}>取消預約</button>
            </div>
          )}
          {x.status !== "cancelled" && x.payment_status === "paid" && <button className="mineCancelPaid" onClick={() => cancel(x.booking_no)}>取消預約</button>}
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
      {loading && <p className="mineLoading">讀取中，請稍後…</p>}
      {!loading && !rows.length && !error && <p className="emptyHint">目前沒有預約紀錄</p>}
      <div className="mineList">
        {rows.map((x: any) => {
          const date = x.slot_start
              ? new Date(x.slot_start)
              : new Date(x.paid_at || x.created_at),
            missing = x.payment_status === "paid" && !complete(x);
          return (
            <button
              className="mineSummary"
              key={x.booking_no}
              onClick={() => setSelected(x)}
            >
              <span className="mineDate">
                <small>
                  {date.toLocaleString("zh-TW", {
                    month: "numeric",
                    timeZone: "Asia/Taipei",
                  }).replace("月", "")}月
                </small>
                <b>
                  {date.toLocaleString("zh-TW", {
                    day: "numeric",
                    timeZone: "Asia/Taipei",
                  }).replace("日", "")}日
                </b>
                <small>{date.getFullYear()}</small>
              </span>
              <span className="mineSummaryBody">
                <span
                  className={`mineStatus ${status(x) === "已付款" ? "paid" : status(x) === "待付款" ? "pending" : "expired"}`}
                >
                  {status(x)}
                </span>
                <span className={`methodTag ${x.consultation_methods?.code}`}>{x.consultation_methods?.code === "video" ? "視訊諮詢" : "文字諮詢"}</span>
                <small>
                  {x.booking_details?.map(itemText).join("、")}
                </small>
                {missing && <strong>！尚未填寫諮詢者資料</strong>}
              </span>
              <span className="mineArrow">›</span>
            </button>
          );
        })}
      </div>
    </main>
  );
}
