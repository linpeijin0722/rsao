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
export default function Mine() {
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState("");
  const load = () =>
    fetch("/api/my-bookings").then(async (r) => {
      const j = await r.json();
      r.ok ? setRows(j.bookings) : setError(j.error);
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
    if (!confirm("確定取消這筆待付款預約？")) return;
    await fetch("/api/my-bookings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: no }),
    });
    setSelected(null);
    load();
  }
  if (selected) {
    const x = selected,
      missing = x.status !== "cancelled" && !complete(x);
    return (
      <main className="dataPage minePage mineDetail">
        <button className="mineBack" onClick={() => setSelected(null)}>
          ‹ 返回所有預約
        </button>
        <section>
          <div className="mineDetailTop">
            <div>
              <small>{x.consultation_methods?.title}</small>
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
          <p>
            訂單編號：<b>{x.booking_no}</b>
          </p>
          {x.slot_start && (
            <p>
              預約時間：
              {new Date(x.slot_start).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
              })}
            </p>
          )}
          <div className="mineItems">
            {x.booking_details?.map((d: any, i: number) => (
              <span key={i}>{d.item_title}</span>
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
          {!missing && x.status !== "cancelled" && (
            <a href={`/booking-data?order=${encodeURIComponent(x.booking_no)}`}>
              查看諮詢者資料
            </a>
          )}
        </section>
      </main>
    );
  }
  return (
    <main className="dataPage minePage mineOverview">
      <h1>我的預約</h1>
      {error && <div className="error">{error}</div>}
      {!rows.length && !error && <p className="emptyHint">目前沒有預約紀錄</p>}
      <div className="mineList">
        {rows.map((x: any) => {
          const date = x.slot_start
              ? new Date(x.slot_start)
              : new Date(x.paid_at || x.created_at),
            missing = x.status !== "cancelled" && !complete(x);
          return (
            <button
              className="mineSummary"
              key={x.booking_no}
              onClick={() => setSelected(x)}
            >
              <span className="mineDate">
                <small>
                  {date.toLocaleString("zh-TW", {
                    month: "short",
                    timeZone: "Asia/Taipei",
                  })}
                </small>
                <b>
                  {date.toLocaleString("zh-TW", {
                    day: "2-digit",
                    timeZone: "Asia/Taipei",
                  })}
                </b>
                <small>{date.getFullYear()}</small>
              </span>
              <span className="mineSummaryBody">
                <span
                  className={`mineStatus ${status(x) === "已付款" ? "paid" : status(x) === "待付款" ? "pending" : "expired"}`}
                >
                  {status(x)}
                </span>
                <b>{x.consultation_methods?.title}</b>
                <small>
                  {x.booking_details?.map((d: any) => d.item_title).join("、")}
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
