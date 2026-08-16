"use client";
import { useEffect, useState } from "react";
export default function Complete() {
  const [order, setOrder] = useState("");
  const lineUrl = process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL || "";
  useEffect(() => {
    setOrder(new URLSearchParams(location.search).get("order") || "");
    if (!lineUrl) return;
    const timer = window.setTimeout(
      () => window.location.assign(lineUrl),
      3500,
    );
    return () => window.clearTimeout(timer);
  }, [lineUrl]);
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
        {lineUrl && (
          <>
            <p>即將返回 LINE 官方帳號…</p>
            <a href={lineUrl}>立即返回 LINE</a>
          </>
        )}
      </section>
    </main>
  );
}
