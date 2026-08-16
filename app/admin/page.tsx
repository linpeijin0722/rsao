"use client";
import { useEffect, useMemo, useState } from "react";
type R = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  valid_from: string | null;
  valid_until: string | null;
  is_open: boolean;
};
type W = { weekday: number; start_time: string; is_open: boolean };
type H = { holiday_date: string; note: string | null };
const days = ["一", "二", "三", "四", "五", "六", "日"],
  times = Array.from(
    { length: 32 },
    (_, i) =>
      `${String(7 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`,
  ),
  today = () =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Taipei" }).format(
      new Date(),
    );
export default function Admin() {
  const [login, setLogin] = useState(false),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [rules, setRules] = useState<R[]>([]),
    [weekly, setWeekly] = useState<W[]>([]),
    [holidays, setHolidays] = useState<H[]>([]),
    [methodId, setMethodId] = useState(""),
    [picked, setPicked] = useState<number[]>([]),
    [start, setStart] = useState("09:00"),
    [end, setEnd] = useState("17:00"),
    [opening, setOpening] = useState(true),
    [scope, setScope] = useState("all"),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [date, setDate] = useState(today()),
    [openTimes, setOpenTimes] = useState<string[]>([]),
    [openDates, setOpenDates] = useState<string[]>([]),
    [holidayDate, setHolidayDate] = useState(today()),
    [note, setNote] = useState("");
  const [textCap, setTextCap] = useState<any>({
      enabled: true,
      mode: "monthly",
      release_time: "15:00",
      monthly_limit: "",
    }),
    [textUsed, setTextUsed] = useState(0),
    [weeklyRelease, setWeeklyRelease] = useState<any[]>(
      days.map((_, i) => ({
        weekday: i + 1,
        enabled: false,
        release_count: 0,
      })),
    );
  async function load() {
    const r = await fetch("/api/admin/schedule"),
      j = await r.json();
    if (r.status === 401) return;
    if (!r.ok) return setError(j.error);
    setLogin(true);
    setRules(j.rules);
    setWeekly(j.weekly);
    setHolidays(j.holidays);
    setMethodId(j.methodId);
    dayLoad(j.methodId, date);
    fetch("/api/admin/text-capacity").then(async (x) => {
      if (x.ok) {
        const y = await x.json();
        setTextCap(y.settings);
        setTextUsed(y.used);
        setWeeklyRelease(
          y.weekly?.length
            ? y.weekly
            : days.map((_: string, i: number) => ({
                weekday: i + 1,
                enabled: false,
                release_count: 0,
              })),
        );
      }
    });
  }
  async function saveTextCapacity() {
    const r = await fetch("/api/admin/text-capacity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: textCap.enabled,
        monthlyLimit: textCap.monthly_limit ?? "",
        mode: textCap.mode,
        releaseTime: textCap.release_time,
        weekly: weeklyRelease,
      }),
    });
    if (r.ok) load();
    else setError((await r.json()).error);
  }
  async function dayLoad(id = methodId, d = date) {
    if (!id) return;
    const r = await fetch(`/api/admin/day?methodId=${id}&date=${d}`),
      j = await r.json();
    if (r.ok) setOpenTimes(j.open);
  }
  async function monthLoad(id = methodId, value = month) {
    if (!id) return;
    const response = await fetch(
        `/api/admin/month?methodId=${id}&month=${value}`,
      ),
      result = await response.json();
    if (response.ok) setOpenDates(result.dates || []);
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    dayLoad();
  }, [date, methodId]);
  useEffect(() => {
    monthLoad();
  }, [month, methodId]);
  async function signIn() {
    const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      }),
      j = await r.json();
    if (!r.ok) return setError(j.error);
    load();
  }
  async function save() {
    if (start < "07:00" || end > "23:00")
      return setError("時間只能設定在07:00至23:00");
    const vf = scope === "from" || scope === "range" ? from : null,
      vu = scope === "until" || scope === "range" ? until : null,
      r = await fetch("/api/admin/schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          weekdays: picked,
          startTime: start,
          endTime: end,
          validFrom: vf,
          validUntil: vu,
          isOpen: opening,
        }),
      }),
      j = await r.json();
    if (!r.ok) return setError(j.error);
    load();
  }
  function weeklyOpen(day: number, t: string) {
    const o = weekly.find(
      (x) => x.weekday === day && x.start_time.slice(0, 5) === t,
    );
    if (o) return o.is_open;
    return (
      rules.some(
        (r) =>
          r.weekday === day &&
          r.is_open &&
          t >= r.start_time.slice(0, 5) &&
          t < r.end_time.slice(0, 5),
      ) &&
      !rules.some(
        (r) =>
          r.weekday === day &&
          !r.is_open &&
          t >= r.start_time.slice(0, 5) &&
          t < r.end_time.slice(0, 5),
      )
    );
  }
  async function weekToggle(day: number, t: string) {
    const value = !weeklyOpen(day, t);
    await fetch("/api/admin/weekly", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ weekday: day, startTime: t, isOpen: value }),
    });
    setWeekly((w) => [
      ...w.filter(
        (x) => !(x.weekday === day && x.start_time.slice(0, 5) === t),
      ),
      { weekday: day, start_time: t, is_open: value },
    ]);
  }
  async function slotToggle(t: string) {
    const value = !openTimes.includes(t),
      r = await fetch("/api/admin/slots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          methodId,
          slotStart: `${date}T${t}:00+08:00`,
          isOpen: value,
        }),
      });
    if (r.ok) dayLoad();
  }
  async function holidayAdd() {
    if (holidayDate < today()) return setError("休假日不能早於今天");
    await fetch("/api/admin/holidays", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: holidayDate, note }),
    });
    setDate(holidayDate);
    load();
  }
  async function holidayDel(d: string) {
    await fetch(`/api/admin/holidays?date=${d}`, { method: "DELETE" });
    load();
  }
  async function ruleDel(id: string) {
    await fetch(`/api/admin/schedule?id=${id}`, { method: "DELETE" });
    load();
  }
  const cal = useMemo(() => {
    const [y, m] = month.split("-").map(Number),
      pad = (new Date(y, m - 1, 1).getDay() + 6) % 7,
      n = new Date(y, m, 0).getDate();
    return [
      ...Array(pad).fill(null),
      ...Array.from(
        { length: n },
        (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
      ),
    ];
  }, [month]);
  if (!login)
    return (
      <main className="adminLogin">
        <div>
          <h1>時段管理後台</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理密碼"
          />
          <button onClick={signIn}>登入</button>
          {error && <p>{error}</p>}
        </div>
      </main>
    );
  return (
    <main className="adminPage">
      <header>
        <h1>時段管理後台</h1>
      </header>
      {error && <div className="error">{error}</div>}
      <section className="adminCard textSettingsBlock">
        <h2>文字諮詢設定</h2>
        <p>本月目前預約：{textUsed} 筆</p>
        <div className="ruleActions">
          <button
            className={!textCap.enabled ? "closeMode" : ""}
            onClick={() => setTextCap({ ...textCap, enabled: false })}
          >
            關閉
          </button>
          <button
            className={textCap.enabled ? "openMode" : ""}
            onClick={() => setTextCap({ ...textCap, enabled: true })}
          >
            開啟
          </button>
        </div>
        <div className="adminGrid">
          <label>
            名額規則
            <select
              value={textCap.mode}
              onChange={(e) => setTextCap({ ...textCap, mode: e.target.value })}
            >
              <option value="monthly">每月開放名額</option>
              <option value="weekly">每週釋出名額</option>
            </select>
          </label>
          <label>
            釋出時間
            <input
              type="time"
              value={String(textCap.release_time || "15:00").slice(0, 5)}
              onChange={(e) =>
                setTextCap({ ...textCap, release_time: e.target.value })
              }
            />
          </label>
        </div>
        {textCap.mode === "monthly" && (
          <div className="adminGrid">
            <label>
              該月總名額
              <input
                type="number"
                min="0"
                value={textCap.monthly_limit ?? ""}
                onChange={(e) =>
                  setTextCap({ ...textCap, monthly_limit: e.target.value })
                }
                placeholder="不限"
              />
            </label>
            <p>系統會依當月天數計算平均值，每天到指定時間自動累計釋出。</p>
          </div>
        )}
        {textCap.mode === "weekly" && (
          <div className="weeklyReleaseGrid">
            {weeklyRelease.map((rule, i) => (
              <label
                className={rule.enabled ? "enabled" : ""}
                key={rule.weekday}
              >
                <span>
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={(e) =>
                      setWeeklyRelease((v) =>
                        v.map((x, j) =>
                          j === i ? { ...x, enabled: e.target.checked } : x,
                        ),
                      )
                    }
                  />
                  週{days[i]}
                </span>
                <input
                  type="number"
                  min="0"
                  value={rule.release_count}
                  onChange={(e) =>
                    setWeeklyRelease((v) =>
                      v.map((x, j) =>
                        j === i ? { ...x, release_count: e.target.value } : x,
                      ),
                    )
                  }
                  disabled={!rule.enabled}
                />
                <small>位</small>
              </label>
            ))}
          </div>
        )}
        <button className="holidayButton" onClick={saveTextCapacity}>
          儲存文字名額設定
        </button>
      </section>
      <div className="consultationDivider">
        <h2>視訊諮詢時段設定</h2>
        <p>以下設定只影響視訊諮詢可預約時間。</p>
      </div>
      <section className="adminCard">
        <h2>建立每週開放規則</h2>
        <div className="weekdayRow">
          {days.map((d, i) => (
            <button
              key={d}
              className={picked.includes(i + 1) ? "selected" : ""}
              onClick={() =>
                setPicked((v) =>
                  v.includes(i + 1)
                    ? v.filter((x) => x !== i + 1)
                    : [...v, i + 1],
                )
              }
            >
              {d}
            </button>
          ))}
        </div>
        <div className="adminGrid">
          <label>
            開始時間
            <input
              type="time"
              min="07:00"
              max="22:30"
              step="1800"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            結束時間
            <input
              type="time"
              min="07:30"
              max="23:00"
              step="1800"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="all">所有日期</option>
          <option value="from">指定日期以後</option>
          <option value="until">指定日期以前</option>
          <option value="range">日期區間</option>
        </select>
        {(scope === "from" || scope === "range") && (
          <input
            type="date"
            min={today()}
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        )}{" "}
        {(scope === "until" || scope === "range") && (
          <input
            type="date"
            min={today()}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
          />
        )}
        <div className="ruleActions">
          <button
            className={!opening ? "closeMode" : ""}
            onClick={() => setOpening(false)}
          >
            關閉
          </button>
          <button
            className={opening ? "openMode" : ""}
            onClick={() => setOpening(true)}
          >
            開啟
          </button>
          <button className="primary" onClick={save}>
            套用規則
          </button>
        </div>
      </section>
      <section className="adminCard wide">
        <h2>每週時段總覽</h2>
        <p className="legend">
          <i />
          開放　
          <span />
          不開放　點擊格子可切換
        </p>
        <div className="weekChart">
          <div className="timeHeader">
            <b></b>
            {times.map((t) => (
              <small key={t}>{t.endsWith("00") ? t : ""}</small>
            ))}
          </div>
          {days.map((d, di) => (
            <div className="weekRow" key={d}>
              <b>週{d}</b>
              {times.map((t) => (
                <button
                  key={t}
                  title={`週${d} ${t}`}
                  className={weeklyOpen(di + 1, t) ? "open" : "closed"}
                  onClick={() => weekToggle(di + 1, t)}
                />
              ))}
            </div>
          ))}
        </div>
        <h3>規則清單</h3>
        {rules.map((r) => (
          <div className="rule" key={r.id}>
            <span>
              <b className={r.is_open ? "greenText" : "redText"}>
                {r.is_open ? "開啟" : "關閉"}
              </b>
              　週{days[r.weekday - 1]} {r.start_time.slice(0, 5)}–
              {r.end_time.slice(0, 5)}
              <small>
                {r.valid_from || "不限"} ～ {r.valid_until || "不限"}
              </small>
            </span>
            <button onClick={() => ruleDel(r.id)}>刪除</button>
          </div>
        ))}
      </section>
      <section className="adminCard">
        <h2>特定休假日</h2>
        <div className="adminGrid">
          <input
            type="date"
            min={today()}
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="備註（選填）"
          />
        </div>
        <button className="holidayButton" onClick={holidayAdd}>
          加入休假日
        </button>
        {holidays
          .filter((h) => h.holiday_date >= today())
          .map((h) => (
            <div className="rule" key={h.holiday_date}>
              <span>
                {h.holiday_date}
                <small>{h.note}</small>
              </span>
              <button onClick={() => holidayDel(h.holiday_date)}>
                取消休假
              </button>
            </div>
          ))}
      </section>
      <section className="adminCard">
        <h2>個別日期時段</h2>
        <div className="monthNav">
          <button
            disabled={month <= today().slice(0, 7)}
            onClick={() => {
              const [y, m] = month.split("-").map(Number);
              setMonth(new Date(y, m - 2, 1).toISOString().slice(0, 7));
            }}
          >
            ‹
          </button>
          <input
            type="month"
            min={today().slice(0, 7)}
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            onClick={() => {
              const [y, m] = month.split("-").map(Number);
              setMonth(new Date(y, m, 1).toISOString().slice(0, 7));
            }}
          >
            ›
          </button>
        </div>
        <div className="calendar">
          <div className="calHeads">
            {days.map((d) => (
              <b key={d}>{d}</b>
            ))}
          </div>
          <div className="calDays">
            {cal.map((d, i) =>
              d ? (
                <button
                  key={d}
                  disabled={d < today()}
                  className={`${date === d ? "selected" : ""} ${openDates.includes(d) ? "hasOpen" : ""} ${holidays.some((h) => h.holiday_date === d) ? "holiday" : ""}`}
                  onClick={() => setDate(d)}
                >
                  {Number(d.slice(-2))}
                  {holidays.some((h) => h.holiday_date === d) && (
                    <b className="holidayX">×</b>
                  )}
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </div>
        <h3>{date} 的時段</h3>
        {holidays.some((h) => h.holiday_date === date) && (
          <div className="holidayNotice">此日為休假日</div>
        )}
        <div className="daySlots">
          {times.map((t) => (
            <button
              key={t}
              className={openTimes.includes(t) ? "open" : "closed"}
              onClick={() => slotToggle(t)}
            >
              <b>{t}</b>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
