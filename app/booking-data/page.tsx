"use client";
import { useEffect, useState } from "react";
export default function BookingData() {
  const [order, setOrder] = useState(""),
    [data, setData] = useState<any>(null),
    [form, setForm] = useState({
      relationship: "本人",
      name: "",
      gender: "",
      birth_date: "",
      birth_time: "",
      is_lunar: false,
      notes: "",
    }),
    [msg, setMsg] = useState("");
  async function load(o = order) {
    const r = await fetch(`/api/booking-data?order=${encodeURIComponent(o)}`),
      j = await r.json();
    if (r.ok) setData(j);
    else setMsg(j.error);
  }
  useEffect(() => {
    const o = new URLSearchParams(location.search).get("order") || "";
    setOrder(o);
    load(o);
  }, []);
  async function add() {
    const r = await fetch("/api/booking-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ order, profile: form }),
      }),
      j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setForm({ ...form, name: "", notes: "" });
    load();
  }
  async function assign(detailId: string, profileId: string) {
    await fetch("/api/booking-data", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ order, detailId, profileId }),
    });
    load();
  }
  return (
    <main className="dataPage">
      <h1>填寫諮詢者資料</h1>
      <p>
        訂單編號：<b>{order}</b>
      </p>
      {msg && <div className="error">{msg}</div>}
      <section>
        <h2>新增本人／家人</h2>
        <div className="dataGrid">
          <label>
            關係
            <select
              value={form.relationship}
              onChange={(e) =>
                setForm({ ...form, relationship: e.target.value })
              }
            >
              <option>本人</option>
              <option>配偶</option>
              <option>父母</option>
              <option>子女</option>
              <option>其他家人</option>
            </select>
          </label>
          <label>
            姓名
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            性別
            <select
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">請選擇</option>
              <option>男</option>
              <option>女</option>
              <option>其他</option>
            </select>
          </label>
          <label>
            出生日期
            <input
              type="date"
              value={form.birth_date}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
          </label>
          <label>
            出生時間
            <input
              type="time"
              value={form.birth_time}
              onChange={(e) => setForm({ ...form, birth_time: e.target.value })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={form.is_lunar}
              onChange={(e) => setForm({ ...form, is_lunar: e.target.checked })}
            />{" "}
            農曆生日
          </label>
        </div>
        <textarea
          placeholder="其他補充資料"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <button onClick={add} disabled={!form.name}>
          新增資料
        </button>
      </section>
      <section>
        <h2>指定每個諮詢項目</h2>
        {data?.booking?.booking_details?.map((d: any) => (
          <label className="assign" key={d.id}>
            <b>{d.item_title}</b>
            <select
              value={
                data.links.find((x: any) => x.booking_detail_id === d.id)
                  ?.profile_id || ""
              }
              onChange={(e) => assign(d.id, e.target.value)}
            >
              <option value="">請選擇諮詢者（必填）</option>
              {data.profiles.map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.relationship}－{p.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </section>
    </main>
  );
}
