"use client";
import { useEffect, useState } from "react";
export default function Complete() {
  const [order, setOrder] = useState("");
  useEffect(
    () => setOrder(new URLSearchParams(location.search).get("order") || ""),
    [],
  );
  return (
    <main className="dataPage">
      <section style={{ textAlign: "center" }}>
        <h1>預約已送出</h1>
        <p>付款結果正在確認，完成後會由 LINE 發送通知。</p>
        <p>訂單編號</p>
        <h2>{order}</h2>
        <a href={`/booking-data?order=${encodeURIComponent(order)}`}>
          填寫諮詢者資料（必填）
        </a>
      </section>
    </main>
  );
}
