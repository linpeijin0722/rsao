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
type TextDateOverride = { release_date: string; release_count: number | string; note: string | null };
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
const shiftMonth = (value: string, amount: number) => {
  const [year, month] = value.split("-").map(Number),
    serial = year * 12 + month - 1 + amount;
  return `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
};
export default function Admin() {
  const [login, setLogin] = useState(false),
    [password, setPassword] = useState(""),
    [rememberPassword, setRememberPassword] = useState(false),
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
    [confirmCloseDate, setConfirmCloseDate] = useState(false),
    [closingDate, setClosingDate] = useState(false),
    [videoBookingEnabled, setVideoBookingEnabled] = useState(true),
    [videoControlConfirm, setVideoControlConfirm] = useState<"close" | "open" | "close_all" | null>(null),
    [videoControlSaving, setVideoControlSaving] = useState(false),
    [holidayDate, setHolidayDate] = useState(today()),
    [note, setNote] = useState(""),
    [holidayEdit, setHolidayEdit] = useState<H | null>(null),
    [holidayEditDate, setHolidayEditDate] = useState(""),
    [holidayEditNote, setHolidayEditNote] = useState(""),
    [holidayEditSaving, setHolidayEditSaving] = useState(false),
    [textSaveMessage, setTextSaveMessage] = useState("");
  const [textCap, setTextCap] = useState<any>({
      enabled: true,
      mode: "monthly",
      release_time: "15:00",
      monthly_limit: "",
    }),
    [textUsed, setTextUsed] = useState(0),
    [textOverrides, setTextOverrides] = useState<TextDateOverride[]>([]),
    [overrideDate, setOverrideDate] = useState(today()),
    [overrideCount, setOverrideCount] = useState<number | string>(0),
    [overrideNote, setOverrideNote] = useState(""),
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
    if (!r.ok) {
      window.alert(`⚠️ 登入失敗\n\n${j.error || "管理密碼錯誤，請重新輸入。"}`);
      setError("");
      return;
    }
    setLogin(true);
    setRules(j.rules);
    setWeekly(j.weekly);
    setHolidays(j.holidays);
    setMethodId(j.methodId);
    setVideoBookingEnabled(j.videoBookingEnabled !== false);
    dayLoad(j.methodId, date);
    fetch("/api/admin/text-capacity").then(async (x) => {
      if (x.ok) {
        const y = await x.json();
        setTextCap(y.settings);
        setTextUsed(y.used);
        setTextOverrides(y.overrides || []);
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
    setTextSaveMessage("儲存中…");
    const r = await fetch("/api/admin/text-capacity", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enabled: textCap.enabled,
        monthlyLimit: textCap.monthly_limit ?? "",
        mode: textCap.mode,
        releaseTime: textCap.release_time,
        weekly: weeklyRelease,
        overrides: textOverrides,
      }),
    });
    if (r.ok) {
      setTextSaveMessage("✓ 已儲存");
      load();
      window.setTimeout(() => setTextSaveMessage(""), 3500);
    } else {
      setTextSaveMessage("");
      setError((await r.json()).error);
    }
  }
  function addTextOverride() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) return setError("請選擇個別設定日期");
    const releaseCount = Math.max(0, Number(overrideCount) || 0);
    setTextOverrides((current) => [...current.filter((entry) => entry.release_date !== overrideDate), {
      release_date: overrideDate,
      release_count: releaseCount,
      note: overrideNote.trim() || null,
    }].sort((a, b) => a.release_date.localeCompare(b.release_date)));
    setOverrideNote("");
  }
  function weekdayLabel(value: string) {
    return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", weekday: "short" }).format(new Date(`${value}T12:00:00+08:00`));
  }
  function confirmTextEnabled(value: boolean) {
    if (window.confirm(`確定要${value ? "開啟" : "關閉"}文字諮詢預約嗎？`))
      setTextCap({ ...textCap, enabled: value });
  }
  async function dayLoad(id = methodId, d = date) {
    if (!id) return;
    const r = await fetch(`/api/admin/day?methodId=${id}&date=${d}&_=${Date.now()}`, { cache: "no-store" }),
      j = await r.json();
    if (r.ok) setOpenTimes(j.open);
  }
  async function monthLoad(id = methodId, value = month) {
    if (!id) return;
    const response = await fetch(
        `/api/admin/month?methodId=${id}&month=${value}&_=${Date.now()}`,
        { cache: "no-store" },
      ),
      result = await response.json();
    if (response.ok) setOpenDates(result.dates || []);
  }
  useEffect(() => {
    const saved=localStorage.getItem("lin_a_sao_admin_password");
    if(saved){setPassword(saved);setRememberPassword(true)}
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
    if(rememberPassword)localStorage.setItem("lin_a_sao_admin_password",password);
    else localStorage.removeItem("lin_a_sao_admin_password");
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
    if (!methodId) return window.alert("找不到視訊諮詢設定，請重新整理後再試");
    const value = !openTimes.includes(t);

    // 週五開啟個別時段時僅提示，不影響後續操作或前台總開關。
    if (value) {
      const [year, monthValue, dayValue] = date.split("-").map(Number);
      const selectedDay = new Date(year, monthValue - 1, dayValue);
      if (selectedDay.getDay() === 5) {
        window.alert(`${monthValue}/${dayValue}是週五，請確認是否會撞到子龍廟時間。`);
      }
    }

    const r = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        methodId,
        slotStart: `${date}T${t}:00+08:00`,
        isOpen: value,
      }),
    });
    const result = await r.json().catch(() => ({}));
    if (!r.ok) {
      window.alert(`${value ? "開啟" : "關閉"}時段失敗：${result.error || "請稍後再試"}`);
      return;
    }
    // 單日時段是最明確的人工設定，成功後立即反映，再從伺服器重新校正。
    setOpenTimes((current) => value ? [...new Set([...current, t])].sort() : current.filter((item) => item !== t));
    await Promise.all([dayLoad(), monthLoad()]);
  }
  async function closeAllDaySlots() {
    setClosingDate(true);
    const response = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ methodId, date, action: "close_day" }),
    });
    const result = await response.json().catch(() => ({}));
    setClosingDate(false);
    if (!response.ok) {
      setConfirmCloseDate(false);
      window.alert(`關閉失敗：${result.error || "請稍後再試"}`);
      return;
    }
    setConfirmCloseDate(false);
    setOpenTimes([]);
    await Promise.all([dayLoad(), monthLoad()]);
  }
  async function setVideoBookingAccess(enabled: boolean) {
    setVideoControlSaving(true);
    const response = await fetch("/api/admin/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "set_video_booking_enabled", enabled }),
    });
    const result = await response.json().catch(() => ({}));
    setVideoControlSaving(false);
    if (!response.ok) return window.alert(result.error || "設定失敗，請稍後再試");
    setVideoBookingEnabled(enabled);
    setVideoControlConfirm(null);
  }
  async function clearEverySlot() {
    setVideoControlSaving(true);
    const response = await fetch("/api/admin/slots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "close_all" }),
    });
    const result = await response.json().catch(() => ({}));
    setVideoControlSaving(false);
    if (!response.ok) return window.alert(result.error || "清除失敗，請稍後再試");
    setVideoControlConfirm(null);
    await Promise.all([dayLoad(), monthLoad(), load()]);
  }
  const selectedDateLabel = (() => {
    const [year, monthValue, dayValue] = date.split("-").map(Number),
      weekday = days[(new Date(year, monthValue - 1, dayValue).getDay() + 6) % 7];
    return `${monthValue}/${dayValue}(${weekday})`;
  })();
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
  function openHolidayEdit(h: H) {
    setHolidayEdit(h);
    setHolidayEditDate(h.holiday_date);
    setHolidayEditNote(h.note || "");
  }
  async function saveHolidayEdit() {
    if (!holidayEdit || holidayEditSaving) return;
    if (!holidayEditDate) return setError("請選擇休假日期");
    if (holidayEditDate < today()) return setError("休假日不能早於今天");
    setHolidayEditSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/holidays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: holidayEditDate, note: holidayEditNote }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "修改休假日失敗");
      if (holidayEditDate !== holidayEdit.holiday_date) {
        const remove = await fetch(`/api/admin/holidays?date=${holidayEdit.holiday_date}`, { method: "DELETE" });
        if (!remove.ok) throw new Error("新日期已儲存，但舊休假日刪除失敗，請重新整理後確認");
      }
      setHolidayEdit(null);
      setDate(holidayEditDate);
      await load();
    } catch (err: any) {
      setError(err?.message || "修改休假日失敗");
    } finally {
      setHolidayEditSaving(false);
    }
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
          <label className="rememberAdmin"><input type="checkbox" checked={rememberPassword} onChange={e=>setRememberPassword(e.target.checked)}/> 記住我的密碼</label>
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
            onClick={() => confirmTextEnabled(false)}
          >
            關閉
          </button>
          <button
            className={textCap.enabled ? "openMode" : ""}
            onClick={() => confirmTextEnabled(true)}
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
          <div className="textRulePanel"><div className="textRuleHeading"><div><span>01</span><div><h3>每週固定規則</h3><p>設定每週固定釋出的星期與名額。</p></div></div></div><div className="weeklyReleaseGrid">
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
          </div></div>
        )}
        {textCap.mode === "weekly" && <div className="textRulePanel textOverridePanel">
          <div className="textRuleHeading"><div><span>02</span><div><h3>個別日期名額</h3><p>個別日期設定優先於每週固定規則，設定 0 位也會有效關閉當日名額。</p></div></div><b>個別日期 ＞ 每週設定</b></div>
          <div className="textOverrideForm">
            <label>日期<input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} /></label>
            <label>開放名額<input type="number" min="0" value={overrideCount} onChange={(e) => setOverrideCount(e.target.value)} /></label>
            <label>備註（選填）<input value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} placeholder="例如：臨時加開" /></label>
            <button type="button" onClick={addTextOverride}>加入／更新</button>
          </div>
          {textOverrides.length ? <div className="textOverrideList">{textOverrides.map((entry) => <div key={entry.release_date}>
            <span className="textOverrideDate"><b>{entry.release_date}</b><small>{weekdayLabel(entry.release_date)}</small></span>
            <strong>{entry.release_count} 位</strong>
            <span className="textOverrideNote">{entry.note || "無備註"}</span>
            <button type="button" onClick={() => { setOverrideDate(entry.release_date); setOverrideCount(entry.release_count); setOverrideNote(entry.note || ""); }}>編輯</button>
            <button type="button" className="danger" onClick={() => setTextOverrides((current) => current.filter((item) => item.release_date !== entry.release_date))}>刪除</button>
          </div>)}</div> : <div className="textOverrideEmpty">尚未設定個別日期，系統會使用每週固定規則。</div>}
        </div>}
        <button className="holidayButton" onClick={saveTextCapacity}>
          儲存文字名額設定
        </button>
        {textSaveMessage && (
          <strong className="textSaveMessage" role="status">
            {textSaveMessage}
          </strong>
        )}
      </section>
      <div className="consultationDivider">
        <h2>視訊諮詢時段設定</h2>
        <p>以下設定只影響視訊諮詢可預約時間。</p>
      </div>
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
              <div className="holidayRowActions">
                <button className="holidayEditButton" aria-label={`編輯 ${h.holiday_date} 休假日`} title="編輯休假日" onClick={() => openHolidayEdit(h)}>
                  <span aria-hidden="true">✎</span><span>編輯</span>
                </button>
                <button className="holidayCancelButton" onClick={() => holidayDel(h.holiday_date)}>取消休假</button>
              </div>
            </div>
          ))}
      </section>
      {holidayEdit && (
        <div className="adminModalBackdrop" onClick={() => !holidayEditSaving && setHolidayEdit(null)}>
          <div className="adminModal holidayEditModal" onClick={(e) => e.stopPropagation()}>
            <button className="adminModalClose" aria-label="關閉" disabled={holidayEditSaving} onClick={() => setHolidayEdit(null)}>×</button>
            <div className="holidayEditHeading"><span aria-hidden="true">✎</span><div><h2>編輯特定休假日</h2><p>修改日期或備註後儲存即可。</p></div></div>
            <label>休假日期<input type="date" min={today()} value={holidayEditDate} onChange={(e) => setHolidayEditDate(e.target.value)} /></label>
            <label>備註<input value={holidayEditNote} onChange={(e) => setHolidayEditNote(e.target.value)} placeholder="備註（選填）" /></label>
            <div className="holidayEditActions"><button className="secondary" disabled={holidayEditSaving} onClick={() => setHolidayEdit(null)}>取消</button><button className="primary" disabled={holidayEditSaving} onClick={() => void saveHolidayEdit()}>{holidayEditSaving ? "儲存中…" : "儲存修改"}</button></div>
          </div>
        </div>
      )}
      <section className="adminCard">
        <h2>個別日期時段</h2>
        <div className="monthNav">
          <button
            disabled={month <= today().slice(0, 7)}
            onClick={() => {
              setMonth(shiftMonth(month, -1));
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
              setMonth(shiftMonth(month, 1));
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
        <div className={`videoBookingMasterControl ${videoBookingEnabled ? "isEnabled" : "isDisabled"}`}>
          <div><b>前台視訊預約</b><span className={videoBookingEnabled ? "enabled" : "disabled"}>{videoBookingEnabled ? "目前開啟" : "目前關閉"}</span></div>
          <p>關閉時前台會顯示所有時段已額滿，後台下方的時段設定不會變更。</p>
          <div className="videoBookingMasterActions">
            <button className={!videoBookingEnabled ? "activeClose" : ""} onClick={() => setVideoControlConfirm("close")}>關閉</button>
            <button className={videoBookingEnabled ? "activeOpen" : ""} onClick={() => setVideoControlConfirm("open")}>開啟</button>
          </div>
        </div>
        <button className="closeAllDayButton closeEverySlotButton" onClick={() => setVideoControlConfirm("close_all")} disabled={videoControlSaving}>
          清除所有時段
        </button>
        <button className="closeAllDayButton" onClick={() => setConfirmCloseDate(true)} disabled={!methodId || closingDate}>
          清除{selectedDateLabel}所有時段
        </button>
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
      {confirmCloseDate && (
        <div className="modalBackdrop" onClick={() => !closingDate && setConfirmCloseDate(false)}>
          <div className="modal closeDayConfirmModal" onClick={(event) => event.stopPropagation()}>
            <div className="closeDayIcon">!</div>
            <h2>清除當日所有時段？</h2>
            <p>確定要清除 <b>{selectedDateLabel}</b> 目前所有開啟的視訊諮詢時段嗎？</p>
            <small>清除後，該日期暫時不會有可預約時段；不會關閉前台視訊預約功能。</small>
            <div className="closeDayActions">
              <button className="cancel" disabled={closingDate} onClick={() => setConfirmCloseDate(false)}>取消</button>
              <button className="confirmClose" disabled={closingDate} onClick={() => void closeAllDaySlots()}>{closingDate ? "清除中…" : `確認清除 ${selectedDateLabel}`}</button>
            </div>
          </div>
        </div>
      )}
      {videoControlConfirm && (
        <div className="modalBackdrop" onClick={() => !videoControlSaving && setVideoControlConfirm(null)}>
          <div className="modal closeDayConfirmModal" onClick={(event) => event.stopPropagation()}>
            <div className={`closeDayIcon ${videoControlConfirm === "open" ? "openIcon" : ""}`}>{videoControlConfirm === "open" ? "✓" : "!"}</div>
            <h2>{videoControlConfirm === "open" ? "開啟前台視訊預約？" : videoControlConfirm === "close" ? "關閉前台視訊預約？" : "清除所有已開啟時段？"}</h2>
            <p>{videoControlConfirm === "open" ? "開啟後，前台將重新套用下方設定的開放時間。" : videoControlConfirm === "close" ? "關閉後，前台會顯示所有時段已額滿；後台時段設定不會改變。" : "確定要清除目前所有已開啟的視訊諮詢時段嗎？前台視訊預約功能會維持原本的開啟／關閉狀態。"}</p>
            {videoControlConfirm === "close_all" && <small>只清除時段，不會變更上方「前台視訊預約」總開關；之後仍可重新開啟個別時段。</small>}
            <div className="closeDayActions">
              <button className="cancel" disabled={videoControlSaving} onClick={() => setVideoControlConfirm(null)}>取消</button>
              <button className={videoControlConfirm === "open" ? "confirmOpen" : "confirmClose"} disabled={videoControlSaving} onClick={() => videoControlConfirm === "close_all" ? void clearEverySlot() : void setVideoBookingAccess(videoControlConfirm === "open")}>
                {videoControlSaving ? "處理中…" : videoControlConfirm === "open" ? "確認開啟" : videoControlConfirm === "close" ? "確認關閉" : "確認清除所有時段"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
