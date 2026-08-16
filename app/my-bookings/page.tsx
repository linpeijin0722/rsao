"use client";
import { useEffect, useState } from "react";
export default function Mine() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/my-bookings").then(async (r) => {
      const j = await r.json();
      r.ok ? setRows(j.bookings) : setError(j.error);
    });
  }, []);
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
            {x.payment_status === "paid" ? "已付款" : "付款確認中"}　NT${" "}
            {x.total_price.toLocaleString()}
          </p>
          {x.slot_start && (
            <p>
              {new Date(x.slot_start).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
              })}
            </p>
          )}
          <a href={`/booking-data?order=${encodeURIComponent(x.booking_no)}`}>
            填寫／查看諮詢者資料
          </a>
        </section>
      ))}
    </main>
  );
}
