"use client";
import { useEffect, useState } from "react";
export default function Mine() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  const load = () => {
    fetch("/api/my-bookings").then(async (r) => {
      const j = await r.json();
      r.ok ? setRows(j.bookings) : setError(j.error);
    });
  };
  useEffect(load, []);
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
    load();
  }
  return (
    <main className="dataPage">
      <h1>我的預約</h1>
      {error && <div className="error">{error}</div>}
      {rows.map((x) => (
        <section key={x.booking_no}>
          <h2>{x.consultation_methods?.title}</h2>
          <p>
            訂單編號：<b>{x.booking_no}</b>
          </p>
          <p>
            <b>
              {x.status === "cancelled"
                ? "已失效"
                : x.payment_status === "paid"
                  ? `已${x.payment_method === "credit_card" ? "信用卡" : "ATM"}付款`
                  : "待付款"}
            </b>
            　NT$ {x.total_price.toLocaleString()}
          </p>
          {x.slot_start && (
            <p>
              {new Date(x.slot_start).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
              })}
            </p>
          )}
          {x.status === "cancelled" && (
            <details>
              <summary>查看失效原因</summary>
              <p>{x.cancellation_reason || "預約已取消"}</p>
            </details>
          )}
          {x.status !== "cancelled" && x.payment_status !== "paid" && (
            <div>
              <button onClick={() => pay(x.booking_no)}>繼續付款</button>
              <button onClick={() => cancel(x.booking_no)}>取消預約</button>
            </div>
          )}
          <a href={`/booking-data?order=${encodeURIComponent(x.booking_no)}`}>
            填寫／查看諮詢者資料
          </a>
        </section>
      ))}
    </main>
  );
}
