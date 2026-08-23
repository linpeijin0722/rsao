"use client";

import { useEffect, useState } from "react";

const expiryText = (value: string) =>
  new Date(value).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PayPage() {
  const [booking, setBooking] = useState<any>(null);
  const [error, setError] = useState("");
  const order = typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("order") || "";

  async function forward() {
    setError("");
    const response = await fetch("/api/ecpay", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingNo: order }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error || "無法前往付款");
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.action;
    Object.entries(result.fields as Record<string, string>).forEach(([name, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  useEffect(() => {
    if (!order) {
      setError("缺少訂單編號");
      return;
    }
    fetch("/api/my-bookings")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "讀取訂單失敗");
        const found = result.bookings?.find((item: any) => item.booking_no === order);
        if (!found) throw new Error("找不到這筆訂單");
        setBooking(found);
        if (found.status === "cancelled" || found.payment_status === "failed") return;
        window.setTimeout(() => void forward(), 1400);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "讀取訂單失敗"));
  }, [order]);

  const invalid = booking && (booking.status === "cancelled" || booking.payment_status === "failed");
  return (
    <main className="payForward">
      <section>
        <h1>正在前往綠界付款</h1>
        {booking && !invalid && <p>跳轉付款頁面中…請稍後</p>}
        {!booking && !error && <p>正在確認訂單，請稍候…</p>}
        {invalid && <p className="payError">此筆訂單已失效，請重新預約。</p>}
        {error && <p className="payError">{error}</p>}
      </section>
    </main>
  );
}
