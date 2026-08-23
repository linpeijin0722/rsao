"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { lunarProfile } from "@/lib/lunar-profile";
const shichen = [
  "子時（23:00–00:59）",
  "丑時（01:00–02:59）",
  "寅時（03:00–04:59）",
  "卯時（05:00–06:59）",
  "辰時（07:00–08:59）",
  "巳時（09:00–10:59）",
  "午時（11:00–12:59）",
  "未時（13:00–14:59）",
  "申時（15:00–16:59）",
  "酉時（17:00–18:59）",
  "戌時（19:00–20:59）",
  "亥時（21:00–22:59）",
  "不確定",
];
const empty = {
  full_name: "",
  gender: "",
  full_address: "",
  birth_date: "",
  lunar_birth_text: "",
  zodiac: "",
  birth_shichen: "",
  line_picture_url: "",
  line_display_name: "",
};
function calculate(value: string) {
  if (!value) return { lunar_birth_text: "", zodiac: "" };
  const date = new Date(`${value}T12:00:00+08:00`),
    f = new Intl.DateTimeFormat("zh-TW-u-ca-chinese", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Taipei",
    }),
    parts = f.formatToParts(date),
    year = Number(
      parts.find((p: any) => p.type === "relatedYear")?.value ||
        value.slice(0, 4),
    ),
    animals = [
      "鼠",
      "牛",
      "虎",
      "兔",
      "龍",
      "蛇",
      "馬",
      "羊",
      "猴",
      "雞",
      "狗",
      "豬",
    ],
    stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
    branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
    month = String(parts.find((p: any) => p.type === "month")?.value || "").replace(/\D/g, "").padStart(2, "0"),
    day = String(parts.find((p: any) => p.type === "day")?.value || "").replace(/\D/g, "").padStart(2, "0"),
    cycle = year - 4;
  return { lunar_birth_text: `民國${year - 1911}${stems[cycle % 10]}${branches[cycle % 12]}年 ${month}月${day}日`, zodiac: animals[cycle % 12] };
}
export default function MyProfile() {
  const [form, setForm] = useState<any>(empty),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [confirming, setConfirming] = useState(false),
    setup =
      typeof window !== "undefined" &&
      new URLSearchParams(location.search).get("setup") === "1";
  useEffect(() => {
    fetch("/api/my-profile", { cache: "no-store" }).then(async (r) => {
      if (r.status === 401) {
        location.replace("/");
        return;
      }
      const j = await r.json();
      if (r.ok) setForm({ ...empty, ...j.profile });
      else setMessage(j.error);
      setLoading(false);
    });
  }, []);
  function birth(value: string) {
    setForm((v: any) => ({ ...v, birth_date: value, ...lunarProfile(value) }));
  }
  function requestSave() {
    if (!form.full_name || !form.gender || !form.full_address || !form.birth_date || !form.birth_shichen) {
      setMessage("請完整填寫所有欄位");
      return;
    }
    setMessage("");
    setConfirming(true);
  }
  async function goBack() {
    try {
      const id = process.env.NEXT_PUBLIC_LIFF_ID;
      if (id) await liff.init({ liffId: id });
      if (liff.isInClient()) return liff.closeWindow();
    } catch {}
    location.href = "/";
  }
  async function save() {
    setSaving(true);
    setMessage("");
    const r = await fetch("/api/my-profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }),
      j = await r.json();
    setSaving(false);
    if (!r.ok) return setMessage(j.error);
    setConfirming(false);
    setMessage("✓ 資料已儲存");
    setForm((v: any) => ({ ...v, ...j.profile }));
    if (setup) window.setTimeout(() => location.replace("/"), 700);
  }
  if (loading)
    return (
      <main className="profilePage">
        <p>正在讀取資料…</p>
      </main>
    );
  return (
    <main className="profilePage">
      <header>
        <button onClick={goBack}>‹</button>
        <div>
          {form.line_picture_url ? (
            <img src={form.line_picture_url} alt="LINE頭貼" />
          ) : (
            <span>我</span>
          )}
          <h1>{form.line_display_name || "個人資料"}</h1>
        </div>
      </header>
      <div className="profileAccuracy"><span>資料僅供命理諮詢使用</span><strong>請務必填寫正確資料</strong></div>
      <section className="profileForm">
        <label>
            <span>姓名</span>
          <input
            value={form.full_name || ""}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              placeholder="請填寫真實姓名"
          />
        </label>
        <label>
          <span>性別</span>
          <select
            value={form.gender || ""}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
          >
            <option value="">請選擇</option>
            <option>女</option>
            <option>男</option>
            <option>其他</option>
          </select>
        </label>
        <label className="profileAddress">
            <span>地址</span>
            <textarea
              rows={2}
              name="street-address"
              autoComplete="street-address"
            value={form.full_address || ""}
            onChange={(e) => setForm({ ...form, full_address: e.target.value })}
              placeholder="請填寫完整地址"
          />
        </label>
        <label>
          <span>國曆生日</span>
          <input
            type="date"
            value={form.birth_date || ""}
            onChange={(e) => birth(e.target.value)}
            max={new Date().toISOString().slice(0, 10)}
          />
        </label>
        <div className="profileReadOnly">
          <span>農曆生日</span>
          <b>{form.lunar_birth_text || "選擇生日後自動換算"}</b>
        </div>
        <div className="profileReadOnly">
          <span>生肖</span>
          <b>{form.zodiac || "自動換算"}</b>
        </div>
        <label>
          <span>出生時辰</span>
          <select
            value={form.birth_shichen || ""}
            onChange={(e) =>
              setForm({ ...form, birth_shichen: e.target.value })
            }
          >
            <option value="">請選擇</option>
            {shichen.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        {message && (
          <p
            className={
              message.startsWith("✓") ? "profileSuccess" : "profileError"
            }
          >
            {message}
          </p>
        )}
        <button className="profileSave" disabled={saving} onClick={requestSave}>
          {saving ? "儲存中…" : setup ? "儲存並開始預約" : "儲存資料"}
        </button>
      </section>
      {confirming && <div className="modalBackdrop profileConfirmBackdrop" onClick={() => setConfirming(false)}><div className="modal profileConfirmModal" onClick={(event) => event.stopPropagation()}><h2>請確認個人資料</h2><p>您的資料僅用於命理諮詢，為確保命盤解析的準確度與諮詢品質，請務必幫我們仔細核對、確實填寫喔！</p><button disabled={saving} onClick={save}>{saving ? "儲存中…" : "確認並儲存"}</button><button className="cancel" onClick={() => setConfirming(false)}>返回檢查</button></div></div>}
    </main>
  );
}
