"use client";
import { useEffect, useMemo, useState, useRef } from "react";
type H = { holiday_date: string; note: string | null };
type TextDateOverride = { release_date: string; release_count: number | string; note: string | null };
const days = ["一", "二", "三", "四", "五", "六", "日"],
  times = Array.from(
    { length: 91 },
    (_, i) =>
      `${String(7 + Math.floor(i / 6)).padStart(2, "0")}:${String((i % 6)*10).padStart(2,"0")}`,
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
type DayBooking = {id:string;bookingNo:string;customerName:string;start:string;end:string;bufferEnd:string;minutes:number};
function clockLabel(value:string){const hour=Number(value.slice(0,2));return `${hour<12?"上午":hour<13?"中午":hour<18?"下午":"晚上"} ${hour%12||12}:${value.slice(3,5)}`;}
function TimePicker({label,value,onChange,allowEnd=false}:{label:string;value:string;onChange:(value:string)=>void;allowEnd?:boolean}){
  const hour=value.slice(0,2),minute=value.slice(3,5);
  return <div className="scheduleTimePicker"><span>{label}</span><div><select aria-label={`${label}小時`} value={hour} onChange={event=>onChange(`${event.target.value}:${(event.target.value==="23"||(!allowEnd&&event.target.value==="22"))?"00":minute}`)}>{Array.from({length:allowEnd?17:16},(_,index)=>String(index+7).padStart(2,"0")).map(h=><option key={h} value={h}>{clockLabel(`${h}:00`).split(" ")[0]} {Number(h)%12||12} 時</option>)}</select><select aria-label={`${label}分鐘`} value={minute} onChange={event=>onChange(`${hour}:${event.target.value}`)}>{(hour==="23"||(!allowEnd&&hour==="22")?["00"]:["00","10","20","30","40","50"]).map(m=><option key={m} value={m}>{m} 分</option>)}</select></div></div>;
}
export default function Admin() {
  const [login, setLogin] = useState(false),
    [password, setPassword] = useState(""),
    [rememberPassword, setRememberPassword] = useState(false),
    [error, setError] = useState(""),
    [holidays, setHolidays] = useState<H[]>([]),
    [methodId, setMethodId] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [date, setDate] = useState(today()),
    [openTimes, setOpenTimes] = useState<string[]>([]),
    [dayBookings,setDayBookings]=useState<DayBooking[]>([]),
    [showAllTimes,setShowAllTimes]=useState(false),
    [customTimeOpen,setCustomTimeOpen]=useState(false),
    [customTime,setCustomTime]=useState("10:00"),
    [customAction,setCustomAction]=useState("open"),
    [dayLoading,setDayLoading]=useState(false),
    [slotSaving,setSlotSaving]=useState(false),
    [dayError,setDayError]=useState(""),
    [openDates, setOpenDates] = useState<string[]>([]),
    [videoBookingEnabled, setVideoBookingEnabled] = useState(true),
    [videoControlConfirm, setVideoControlConfirm] = useState<"close" | "open" | null>(null),
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
  const selectedDateRef=useRef(date),dayRequestRef=useRef(0);
  selectedDateRef.current=date;
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
    setHolidays(j.holidays);
    setMethodId(j.methodId);
    setVideoBookingEnabled(j.videoBookingEnabled !== false);

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
      } else setError((await x.json()).error || "文字諮詢名額載入失敗");
    });
  }
  async function saveTextCapacity(overrides: TextDateOverride[] = textOverrides) {
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
        overrides,
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
  async function addTextOverride() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) return setError("請選擇個別設定日期");
    const releaseCount = Math.max(0, Number(overrideCount) || 0);
    const next = [...textOverrides.filter((entry) => entry.release_date !== overrideDate), {
      release_date: overrideDate,
      release_count: releaseCount,
      note: overrideNote.trim() || null,
    }].sort((a, b) => a.release_date.localeCompare(b.release_date));
    setTextOverrides(next);
    setOverrideNote("");
    await saveTextCapacity(next);
  }
  async function removeTextOverride(releaseDate: string) {
    if (!window.confirm(`確定刪除 ${releaseDate} 的個別名額設定嗎？`)) return;
    const next = textOverrides.filter((item) => item.release_date !== releaseDate);
    setTextOverrides(next);
    await saveTextCapacity(next);
  }
  function weekdayLabel(value: string) {
    return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", weekday: "short" }).format(new Date(`${value}T12:00:00+08:00`));
  }
  function confirmTextEnabled(value: boolean) {
    if (window.confirm(`確定要${value ? "開啟" : "關閉"}文字諮詢預約嗎？`))
      setTextCap({ ...textCap, enabled: value });
  }
  async function dayLoad(id = methodId, d = date) {
    if (!id || d!==selectedDateRef.current) return;
    const requestId=++dayRequestRef.current;
    setDayLoading(true);setDayError("");
    try{
      const r=await fetch(`/api/admin/day?methodId=${id}&date=${d}&_=${Date.now()}`,{cache:"no-store"}),j=await r.json();
      if(!r.ok)throw new Error(j.error||"無法讀取時段");
      if(requestId!==dayRequestRef.current||d!==selectedDateRef.current)return;
      setOpenTimes(j.open||[]);setDayBookings(j.bookings||[]);
    }catch(err){if(requestId!==dayRequestRef.current||d!==selectedDateRef.current)return;setOpenTimes([]);setDayBookings([]);setDayError(err instanceof Error?err.message:"無法讀取時段");}
    finally{if(requestId===dayRequestRef.current&&d===selectedDateRef.current)setDayLoading(false);}
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
    setShowAllTimes(false);setCustomTimeOpen(false);setOpenTimes([]);setDayBookings([]);dayLoad();
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
  async function slotToggle(t: string, desired?:boolean) {
    if (!methodId) return window.alert("找不到視訊諮詢設定，請重新整理後再試");
    if(slotSaving||dayLoading||dayError)return;
    const value = desired ?? !openTimes.includes(t);
    const blocked=slotBlockReason(t);if(blocked)return setDayError(`${clockLabel(t)}：${blocked}，請選擇其他時間`);
    if(value&&holidays.some(h=>h.holiday_date===date))return setDayError("此日為休假日，請先取消休假再開放時段");

    // 週五開啟個別時段時僅提示，不影響後續操作或前台總開關。
    if (value) {
      const [year, monthValue, dayValue] = date.split("-").map(Number);
      const selectedDay = new Date(year, monthValue - 1, dayValue);
      if (selectedDay.getDay() === 5) {
        window.alert(`${monthValue}/${dayValue}是週五，請確認是否會撞到子龍廟時間。`);
      }
    }

    setSlotSaving(true);
    try {
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
    } catch { setDayError("儲存失敗，請檢查連線後重新讀取"); } finally { setSlotSaving(false); }
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
  function slotBlockReason(t:string){
    const candidate=new Date(`${date}T${t}:00+08:00`).getTime();
    const booking=dayBookings.find(b=>candidate<new Date(b.bufferEnd).getTime()&&candidate+50*60000>new Date(b.start).getTime());
    if(!booking)return "";
    return candidate<new Date(booking.start).getTime()?"與預約重疊":candidate<new Date(booking.end).getTime()?"已預約":"預約緩衝時間";
  }
  function bookingClock(value:string){return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Taipei",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));}
  const displayTimes=showAllTimes?[...new Set([...times,...openTimes])].sort():[...openTimes].sort();
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
      <div className="consultationSettingsGroup textConsultationGroup">
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
        <div className="adminGrid textSettingsControls">
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
          <div className="adminGrid textMonthlyRule">
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
        <div className="textRulePanel textOverridePanel">
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
            <button type="button" className="danger" onClick={() => void removeTextOverride(entry.release_date)}>刪除</button>
          </div>)}</div> : <div className="textOverrideEmpty">尚未設定個別日期，系統會使用每週固定規則。</div>}
        </div>
        <button className="holidayButton" onClick={() => void saveTextCapacity()}>
          儲存文字名額設定
        </button>
        {textSaveMessage && (
          <strong className="textSaveMessage" role="status">
            {textSaveMessage}
          </strong>
        )}
      </section>
      </div>
      <div className="consultationSettingsGroup videoConsultationGroup">
      <div className="consultationDivider">
        <h2>視訊諮詢時段設定</h2>
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
      <section className="adminCard scheduleDayCard">
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
        <div className="scheduleDayToolbar"><div><b>{showAllTimes?"全部時間":"可預約時間"}</b><small>目前可約 {openTimes.length} 個時段</small></div><button aria-expanded={customTimeOpen} onClick={()=>setCustomTimeOpen(value=>!value)}>自訂時段</button><label><input type="checkbox" checked={showAllTimes} onChange={event=>setShowAllTimes(event.target.checked)}/>顯示全部時間</label></div>
        <p className="scheduleHint">預設只顯示可約時間；需要精細調整時，可自訂時間或展開每 10 分鐘的全部時間。</p>
        {customTimeOpen&&<div className="scheduleCustomTime"><TimePicker label="自訂時間" value={customTime} onChange={setCustomTime}/><label>操作<select value={customAction} onChange={event=>setCustomAction(event.target.value)}><option value="open">開放此時段</option><option value="close">關閉此時段</option></select></label><button className="schedulePrimaryButton" disabled={slotSaving||dayLoading||Boolean(slotBlockReason(customTime))||Boolean(dayError)||(customAction==="open"&&holidays.some(h=>h.holiday_date===date))} onClick={()=>void slotToggle(customTime,customAction==="open")}>{slotSaving?"儲存中…":"套用時段"}</button>{slotBlockReason(customTime)&&<p className="scheduleBlockedHint">{slotBlockReason(customTime)}，請選擇其他時間。</p>}</div>}
        {dayLoading?<p role="status">時段讀取中…</p>:dayError?<div className="scheduleLoadError" role="alert">{dayError}<button onClick={()=>void dayLoad()}>重新讀取</button></div>:<><div className="daySlots scheduleCompactSlots">{displayTimes.map(t=>{const blocked=slotBlockReason(t),open=openTimes.includes(t);return <button key={t} disabled={slotSaving||Boolean(blocked)||holidays.some(h=>h.holiday_date===date)} className={blocked?"booked":open?"open":"closed"} onClick={()=>void slotToggle(t)}><b>{clockLabel(t)}</b><small>{blocked|| (open?"可預約・點選關閉":"未開放・點選開啟")}</small></button>})}</div>{!displayTimes.length&&<p className="scheduleEmpty">此日沒有可約時段。需要加開時，請點「自訂時段」。</p>}
        <section className="scheduleBookedList"><h3>當日已預約（{dayBookings.length} 筆）</h3>{dayBookings.length?dayBookings.map(booking=><article key={booking.id}><div><span>已預約</span><b>{clockLabel(bookingClock(booking.start))} ～ {clockLabel(bookingClock(booking.end))}</b></div><p>諮詢 {booking.minutes} 分鐘・緩衝至 {clockLabel(bookingClock(booking.bufferEnd))}</p><p className="scheduleBookingCustomer">客人：{booking.customerName||"未提供姓名"}</p><small>訂單編號：{booking.bookingNo}</small></article>):<p className="scheduleHint">當日尚無預約。</p>}</section></>}
      </section>
      </div>
      {videoControlConfirm && (
        <div className="modalBackdrop" onClick={() => !videoControlSaving && setVideoControlConfirm(null)}>
          <div className="modal closeDayConfirmModal" onClick={(event) => event.stopPropagation()}>
            <div className={`closeDayIcon ${videoControlConfirm === "open" ? "openIcon" : ""}`}>{videoControlConfirm === "open" ? "✓" : "!"}</div>
            <h2>{videoControlConfirm === "open" ? "開啟前台視訊預約？" : "關閉前台視訊預約？"}</h2>
            <p>{videoControlConfirm === "open" ? "開啟後，前台將顯示手動開放的可約時段。" : "關閉後，前台會顯示所有時段已額滿；後台時段設定不會改變。"}</p>
            <div className="closeDayActions">
              <button className="cancel" disabled={videoControlSaving} onClick={() => setVideoControlConfirm(null)}>取消</button>
              <button className={videoControlConfirm === "open" ? "confirmOpen" : "confirmClose"} disabled={videoControlSaving} onClick={() => void setVideoBookingAccess(videoControlConfirm === "open")}>
                {videoControlSaving ? "處理中…" : videoControlConfirm === "open" ? "確認開啟" : "確認關閉"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
