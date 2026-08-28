"use client";
import liff from "@line/liff";
import { useEffect, useRef, useState } from "react";
import { lunarProfile } from "@/lib/lunar-profile";
const times = [
  "子時（23:00–01:00）",
  "丑時（01:00–03:00）",
  "寅時（03:00–05:00）",
  "卯時（05:00–07:00）",
  "辰時（07:00–09:00）",
  "巳時（09:00–11:00）",
  "午時（11:00–13:00）",
  "未時（13:00–15:00）",
  "申時（15:00–17:00）",
  "酉時（17:00–19:00）",
  "戌時（19:00–21:00）",
  "亥時（21:00–23:00）",
  "不確定",
];
const overallFocusFields: Record<
  string,
  { label: string; placeholder: string }[]
> = {
  想換工作: [
    {
      label: "目前公司／產業",
      placeholder: "例如：科技業、餐飲業，或目前公司名稱",
    },
    {
      label: "目前職位與主要工作內容",
      placeholder: "例如：行政人員，主要負責帳務與客戶聯繫",
    },
    {
      label: "想離開或換工作的主要原因",
      placeholder: "例如：薪資、發展空間、工作環境或身心壓力",
    },
    {
      label: "希望轉往的方向／職務",
      placeholder: "例如：想轉職行銷、自己接案，或尚未確定",
    },
  ],
  想問升職或加薪: [
    { label: "目前公司與職位", placeholder: "例如：在某公司擔任業務專員" },
    { label: "目前任職多久", placeholder: "例如：2年6個月" },
    {
      label: "近期的升遷或調薪機會",
      placeholder: "例如：主管曾提過年底評估，但尚未確定",
    },
    {
      label: "目前最擔心的阻礙",
      placeholder: "例如：年資、績效、同事競爭或主管態度",
    },
  ],
  創業或副業發展: [
    {
      label: "想做的產業／產品或服務",
      placeholder: "例如：網路服飾、餐飲、命理服務或自媒體",
    },
    {
      label: "目前籌備到哪個階段",
      placeholder: "例如：只有想法、已開始接案、準備開店",
    },
    { label: "是否有合夥人", placeholder: "例如：自己經營，或與朋友共同籌備" },
    {
      label: "最想確認的方向或風險",
      placeholder: "例如：適不適合投入、何時開始、合作是否順利",
    },
  ],
  貴人運: [
    {
      label: "目前最需要協助的事情",
      placeholder: "例如：找工作、事業合作、資金或人際關係",
    },
    {
      label: "希望貴人協助的方向",
      placeholder: "例如：提供機會、引薦客戶、給予建議",
    },
    {
      label: "身邊是否已有可能協助的人",
      placeholder: "例如：前主管、長輩、朋友，或目前沒有",
    },
  ],
  職涯迷惘: [
    {
      label: "目前的工作／待業狀態",
      placeholder: "例如：在職但想離開、待業中、準備轉換跑道",
    },
    {
      label: "目前正在考慮的選擇",
      placeholder: "例如：留在原公司、轉職、考證照或創業",
    },
    {
      label: "選擇工作時最在意的條件",
      placeholder: "例如：收入、穩定、成就感、家庭時間",
    },
    {
      label: "目前最大的困難",
      placeholder: "例如：不知道適合什麼、缺乏機會或不敢改變",
    },
  ],
  近期財運: [
    {
      label: "目前主要收入來源",
      placeholder: "例如：固定薪資、業績獎金、接案或投資",
    },
    {
      label: "最近的財務變化",
      placeholder: "例如：收入減少、支出增加、剛換工作",
    },
    {
      label: "最想了解的時間範圍與重點",
      placeholder: "例如：未來半年收入、是否適合投資或有無破財",
    },
  ],
  財務壓力: [
    {
      label: "目前主要的壓力來源",
      placeholder: "例如：貸款、債務、家庭支出或收入不穩",
    },
    {
      label: "這個狀況持續多久了",
      placeholder: "例如：約半年，或從失業後開始",
    },
    {
      label: "最希望改善的事情",
      placeholder: "例如：增加收入、清償債務或穩定現金流",
    },
    {
      label: "是否有重要期限",
      placeholder: "例如：三個月內需繳款；若無可填無",
    },
  ],
  健康提醒: [
    {
      label: "目前最在意的身體狀況",
      placeholder: "例如：睡眠、腸胃、頭痛或長期疲倦",
    },
    { label: "這個狀況持續多久了", placeholder: "例如：約三個月" },
    {
      label: "是否已就醫或做過檢查",
      placeholder: "例如：已看過醫生、檢查正常，或尚未就醫",
    },
    {
      label: "希望老師特別留意的方向",
      placeholder: "例如：近期需要注意的身體部位或生活習慣",
    },
  ],
  其他: [
    { label: "想聚焦的具體事件", placeholder: "請簡單寫下目前最關心的事情" },
    { label: "目前的實際狀況", placeholder: "請說明事情發生的背景與目前進度" },
    {
      label: "這次最想了解的重點",
      placeholder: "請寫下最希望老師協助釐清的方向",
    },
  ],
};
const empty = {
  profile_type: "person",
  relationship: "本人",
  relationship_detail: "",
  name: "",
  gender: "",
  birth_date: "",
  lunar_birth_text: "",
  zodiac: "",
  birth_shichen: "",
  address: "",
  death_date: "",
  lunar_death_text: "",
  death_shichen: "",
  owner_profile_id: "",
  photo_data: "",
  notes: "",
};
const lunar = (v: string) => lunarProfile(v).lunar_birth_text;
const zodiac = (v: string) => {
  const a = [
    "猴",
    "雞",
    "狗",
    "豬",
    "鼠",
    "牛",
    "虎",
    "兔",
    "龍",
    "蛇",
    "馬",
    "羊",
  ];
  return v ? a[new Date(`${v}T12:00:00`).getFullYear() % 12] : "";
};
const profileKey = (profile: any) =>
  `${profile.profile_type || ""}|${profile.relationship || ""}|${profile.name || ""}`;
const mergeProfiles = (profiles: any[]) => {
  const groups = new Map<string, any>();
  for (const profile of profiles) {
    const key = profileKey(profile),
      current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ...profile,
        pregnancy_losses: Array.isArray(profile.pregnancy_losses)
          ? [...profile.pregnancy_losses]
          : [],
      });
      continue;
    }
    const merged = [...(current.pregnancy_losses || [])];
    for (const loss of Array.isArray(profile.pregnancy_losses)
      ? profile.pregnancy_losses
      : []) {
      const lossId = `${String(loss?.date || "").slice(0, 10)}|${loss?.accuracy || ""}|${loss?.shichen || ""}`;
      if (
        !merged.some(
          (saved: any) =>
            `${String(saved?.date || "").slice(0, 10)}|${saved?.accuracy || ""}|${saved?.shichen || ""}` ===
            lossId,
        )
      )
        merged.push(loss);
    }
    current.pregnancy_losses = merged;
  }
  return [...groups.values()];
};
export default function BookingData() {
  const savingRef = useRef(0);
  const [order, setOrder] = useState(""),
    [data, setData] = useState<any>(null),
    [form, setForm] = useState<any>(empty),
    [showForm, setShowForm] = useState(false),
    [editingId, setEditingId] = useState(""),
    [deleteConfirmId, setDeleteConfirmId] = useState(""),
    [petFields, setPetFields] = useState(false),
    [msg, setMsg] = useState(""),
    [saving, setSaving] = useState(false),
    [savingItems, setSavingItems] = useState(0),
    [submitWaiting, setSubmitWaiting] = useState(false),
    [confirmSubmit, setConfirmSubmit] = useState(false),
    [submitSuccess, setSubmitSuccess] = useState(false),
    [lineSendWarning, setLineSendWarning] = useState(""),
    [missingItems, setMissingItems] = useState<string[]>([]);
  async function restoreLineLogin() {
    const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
    if (!liffId) return false;
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: location.href });
      return false;
    }
    const accessToken = liff.getAccessToken();
    if (!accessToken) return false;
    const response = await fetch("/api/line/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    return response.ok;
  }
  async function load(o = order, retry = true) {
    let r = await fetch(`/api/booking-data?order=${encodeURIComponent(o)}`, {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok && r.status === 401 && retry) {
      try {
        if (await restoreLineLogin()) return load(o, false);
      } catch {}
    }
    if (r.ok) {
      setData(j);
      setMsg("");
    } else setMsg(j.error);
  }
  useEffect(() => {
    const o = new URLSearchParams(location.search).get("order") || "";
    setOrder(o);
    void load(o);
  }, []);
  function date(field: "birth_date" | "death_date", v: string) {
    setForm({
      ...form,
      [field]: v,
      [field === "birth_date" ? "lunar_birth_text" : "lunar_death_text"]:
        lunar(v),
      ...(field === "birth_date" ? { zodiac: zodiac(v) } : {}),
    });
  }
  function photo(file?: File) {
    if (!file) return;
    const image = new Image(),
      url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 1000,
        scale = Math.min(1, max / Math.max(image.width, image.height)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(image, 0, 0, canvas.width, canvas.height);
      setForm((value: any) => ({
        ...value,
        photo_data: canvas.toDataURL("image/jpeg", 0.72),
      }));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }
  async function add() {
    setSaving(true);
    const payload = editingId
        ? {
            order,
            action: "update_profile",
            profileId: editingId,
            profile: form,
          }
        : { order, profile: form },
      r = await fetch("/api/booking-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
      j = await r.json();
    setSaving(false);
    if (!r.ok) return setMsg(j.error);
    setForm(empty);
    setEditingId("");
    setShowForm(false);
    setMsg("資料已儲存，下次可直接選取");
    void load();
  }
  async function removeProfile(id: string) {
    const r = await fetch("/api/booking-data", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          order,
          action: "delete_profile",
          profileId: id,
        }),
      }),
      j = await r.json();
    setDeleteConfirmId("");
    if (r.ok) {
      setShowForm(false);
      setEditingId("");
      setMsg("資料已刪除");
      void load();
    } else setMsg(j.error);
  }
  async function assign(
    detailId: string,
    profileId: string,
    questions: string[],
    profileIds?: string[],
    extraData?: any,
  ) {
    savingRef.current++;
    setSavingItems(savingRef.current);
    try {
      const r = await fetch("/api/booking-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            order,
            detailId,
            profileId,
            profileIds,
            questions,
            extraData,
          }),
        }),
        j = await r.json();
      setMsg(r.ok ? "" : j.error);
      if (r.ok) await load();
      return r.ok;
    } finally {
      savingRef.current = Math.max(0, savingRef.current - 1);
      setSavingItems(savingRef.current);
    }
  }
  async function submitAll() {
    setSubmitWaiting(true);
    setSaving(true);
    setMsg("");
    while (savingRef.current > 0)
      await new Promise((resolve) => setTimeout(resolve, 400));
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 25000);
    try {
      // 先完成資料庫送出；LINE 初始化或聊天室傳訊失敗，不得阻止後台收到資料。
      const r = await fetch("/api/booking-data", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ order, action: "submit" }),
          signal: controller.signal,
        }),
        responseText = await r.text();
      let j: any = {};
      try {
        j = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(`伺服器回應異常（${r.status}），請稍後再試`);
      }
      if (!r.ok) throw new Error(j.error || "資料送出失敗，請稍後再試");
      if (!j.ok || !j.submitted)
        throw new Error("伺服器未確認資料已送出，請稍後再試");

      setData((current: any) => ({
        ...current,
        booking: {
          ...current?.booking,
          data_submitted_at: j.data_submitted_at || new Date().toISOString(),
        },
      }));
      setConfirmSubmit(false);
      setSubmitSuccess(true);
      setMsg("");

      const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
      try {
        if (!liffId) throw new Error("尚未設定 LIFF ID");
        await Promise.race([
          liff.init({ liffId }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("LINE 初始化逾時")), 8000),
          ),
        ]);
        if (!liff.isInClient())
          throw new Error("目前不在 LINE 應用程式內，無法代您傳送聊天室訊息");
        await liff.sendMessages([
          {
            type: "text",
            text: `我已完成填單，姓名：${data?.customer?.full_name || "未填寫"}`,
          },
        ]);
      } catch (lineError) {
        console.error("問事資料已送出，但 LINE 聊天訊息傳送失敗", lineError);
        setLineSendWarning(
          "資料已成功送到後台，但 LINE 聊天訊息未能自動傳送。請回到官方帳號告知助理您已完成填單。",
        );
      }
    } catch (error) {
      setMsg(
        error instanceof DOMException && error.name === "AbortError"
          ? "送出逾時，請確認網路後再試一次"
          : error instanceof Error
            ? error.message
            : "資料送出失敗，請稍後再試",
      );
    } finally {
      clearTimeout(timer);
      setSubmitWaiting(false);
      setSaving(false);
    }
  }
  function returnToLine() {
    location.assign(
      process.env.NEXT_PUBLIC_LINE_OFFICIAL_ACCOUNT_URL ||
        `/my-bookings?order=${encodeURIComponent(order)}`,
    );
  }
  const profiles = data?.profiles || [],
    uniqueProfiles = mergeProfiles(profiles),
    details = data?.booking?.booking_details || [];
  return (
    <main className="dataPage questionPage">
      <header>
        <button onClick={() => (location.href = "/")}>‹</button>
        <div>
          <h1>提供問事資料</h1>
          <p>訂單編號：{order}</p>
        </div>
      </header>
      {msg && <div className="questionMessage">{msg}</div>}
      <section className="profilePicker">
        <div className="sectionHead">
          <div>
            <h2>諮詢者資料</h2>
            <p>儲存一次，下次預約即可快速選取。</p>
          </div>
          <button
            onClick={() => {
              setEditingId("");
              setForm(empty);
              setShowForm(true);
            }}
          >
            ＋ 新增資料
          </button>
        </div>
        {!data && <p className="profilesLoading">載入中，請稍後10～20秒…</p>}
        <div className="savedProfiles">
          {uniqueProfiles.map((p: any) => (
            <article
              role="button"
              tabIndex={0}
              onClick={() => {
                setEditingId(p.id);
                setForm({ ...empty, ...p });
                setPetFields(p.profile_type === "pet");
                setShowForm(true);
              }}
              key={p.id}
            >
              {p.profile_type === "pet" &&
                (p.photo_data ? (
                  <img src={p.photo_data} alt="" />
                ) : (
                  <span>寵</span>
                ))}
              <div>
                <b>{p.name}</b>
                <small>
                  {p.relationship === "本人" && !p.relationship_detail
                    ? "本人"
                    : p.profile_type === "person"
                      ? "親友"
                      : p.relationship}
                  {p.relationship_detail ? `・${p.relationship_detail}` : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      </section>
      {showForm && (
        <div className="modalBackdrop">
          <div className="modal profileModal">
            <button className="closeProfile" onClick={() => setShowForm(false)}>
              ×
            </button>
            <h2>{editingId ? "編輯諮詢者資料" : "新增可快速選取的資料"}</h2>
            <div className="profileKinds">
              <button
                className={form.profile_type === "person" ? "selected" : ""}
                onClick={() => {
                  setPetFields(false);
                  setForm({
                    ...empty,
                    profile_type: "person",
                    relationship: "親友",
                  });
                }}
              >
                親友
              </button>
              <button
                className={form.profile_type === "deceased" ? "selected" : ""}
                onClick={() => {
                  setPetFields(false);
                  setForm({
                    ...empty,
                    profile_type: "deceased",
                    relationship: "過世親人",
                  });
                }}
              >
                過世親友
              </button>
              <button
                className={form.profile_type === "pet" ? "selected" : ""}
                onClick={() => {
                  setPetFields(false);
                  setForm({
                    ...empty,
                    profile_type: "pet",
                    relationship: "往生寵物",
                  });
                }}
              >
                往生寵物
              </button>
            </div>
            <div className="profileFields">
              {form.profile_type === "pet" && (
                <label className="wide">
                  先選取寵物主人
                  <select
                    value={form.owner_profile_id}
                    onChange={(e) =>
                      setForm({ ...form, owner_profile_id: e.target.value })
                    }
                  >
                    <option value="">請選擇主人</option>
                    {uniqueProfiles
                      .filter((p: any) => p.profile_type === "person")
                      .map((p: any) => (
                        <option key={p.id} value={p.id}>
                          {p.name}（{p.relationship_detail || p.relationship}）
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {form.profile_type === "pet" && !petFields && (
                <button
                  className="wide addPetFields"
                  disabled={!form.owner_profile_id}
                  onClick={() => setPetFields(true)}
                >
                  ＋ 新增往生寵物資料
                </button>
              )}
              {(form.profile_type !== "pet" || petFields) && (
                <>
                  <label>
                    {form.profile_type === "pet" ? "寵物姓名" : "姓名"}
                    <input
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </label>
                  {form.profile_type !== "pet" && (
                    <label>
                      他是我的…
                      <input
                        placeholder="例如：母親、朋友"
                        value={form.relationship_detail}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            relationship_detail: e.target.value,
                          })
                        }
                      />
                    </label>
                  )}
                  {form.profile_type === "pet" && (
                    <>
                      <label className="wide">
                        國曆出生日期
                        <input
                          type="date"
                          value={form.birth_date}
                          onChange={(e) => date("birth_date", e.target.value)}
                        />
                      </label>
                      <label className="wide readonly">
                        農曆生日
                        <input readOnly value={form.lunar_birth_text} />
                      </label>
                      <label className="wide">
                        寵物照片
                        <small>
                          請上傳光線充足、主體清晰且完整呈現寵物樣貌的照片。
                        </small>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => photo(e.target.files?.[0])}
                        />
                      </label>
                    </>
                  )}
                </>
              )}
              {(form.profile_type !== "pet" || petFields) && (
                <>
                  {form.profile_type !== "pet" && (
                    <>
                      <label>
                        性別
                        <select
                          value={form.gender}
                          onChange={(e) =>
                            setForm({ ...form, gender: e.target.value })
                          }
                        >
                          <option value="">請選擇</option>
                          <option>男</option>
                          <option>女</option>
                          <option>其他</option>
                        </select>
                      </label>
                      <label className="wide">
                        國曆生日
                        <input
                          type="date"
                          value={form.birth_date}
                          onChange={(e) => date("birth_date", e.target.value)}
                        />
                      </label>
                      <label className="wide readonly">
                        農曆生日
                        <input readOnly value={form.lunar_birth_text} />
                      </label>
                      <label className="readonly">
                        生肖
                        <input readOnly value={form.zodiac} />
                      </label>
                      <label>
                        出生時辰
                        <select
                          value={form.birth_shichen}
                          onChange={(e) =>
                            setForm({ ...form, birth_shichen: e.target.value })
                          }
                        >
                          <option value="">請選擇</option>
                          {times.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {form.profile_type === "person" && (
                    <label className="wide">
                      完整地址
                      <small>
                        <input
                          type="checkbox"
                          onChange={(e) =>
                            e.target.checked &&
                            setForm({
                              ...form,
                              address: data?.customer?.full_address || "",
                            })
                          }
                        />{" "}
                        同我的地址
                      </small>
                      <textarea
                        value={form.address}
                        onChange={(e) =>
                          setForm({ ...form, address: e.target.value })
                        }
                      />
                    </label>
                  )}
                  {form.profile_type !== "person" && (
                    <>
                      <label className="wide">
                        {form.profile_type === "pet" ? "寵物資料" : "生前住址"}
                        {form.profile_type === "pet" ? null : (
                          <>
                            <small>
                              <input
                                type="checkbox"
                                onChange={(e) =>
                                  e.target.checked &&
                                  setForm({
                                    ...form,
                                    address: data?.customer?.full_address || "",
                                  })
                                }
                              />{" "}
                              同我的地址
                            </small>
                            <textarea
                              value={form.address}
                              onChange={(e) =>
                                setForm({ ...form, address: e.target.value })
                              }
                            />
                          </>
                        )}
                      </label>
                      <label className="wide">
                        國曆往生日期
                        <input
                          type="date"
                          value={form.death_date}
                          onChange={(e) => date("death_date", e.target.value)}
                        />
                      </label>
                      <label className="wide readonly">
                        農曆往生日期
                        <input readOnly value={form.lunar_death_text} />
                      </label>
                      <label>
                        往生時辰
                        <select
                          value={form.death_shichen}
                          onChange={(e) =>
                            setForm({ ...form, death_shichen: e.target.value })
                          }
                        >
                          <option value="">請選擇</option>
                          {times.map((x) => (
                            <option key={x}>{x}</option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        備註
                        <textarea
                          placeholder="例如：只記得大約年份"
                          value={form.notes}
                          onChange={(e) =>
                            setForm({ ...form, notes: e.target.value })
                          }
                        />
                      </label>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="profileEditActions">
              <button
                className="saveProfile"
                disabled={!form.name || saving}
                onClick={() => void add()}
              >
                {saving ? "儲存中…" : "儲存"}
              </button>
              {editingId && form.relationship !== "本人" && (
                <button
                  className="deleteProfile"
                  onClick={() => setDeleteConfirmId(editingId)}
                >
                  刪除該資料
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {deleteConfirmId && (
        <div className="modalBackdrop deleteConfirm">
          <div className="modal">
            <h2>確認刪除資料</h2>
            <p>該筆資料刪除後將無法復原，請確認是否要刪除。</p>
            <button onClick={() => void removeProfile(deleteConfirmId)}>
              確認刪除
            </button>
            <button className="cancel" onClick={() => setDeleteConfirmId("")}>
              取消
            </button>
          </div>
        </div>
      )}
      <div className="answerSection">
        <h2>逐項指定問事資料</h2>
        <p>每個項目最多可填三個具體問題；沒有問題可以留白。</p>
        {details.map((d: any) => {
          const old = data?.links?.find(
            (x: any) => x.booking_detail_id === d.id,
          );
          return (
            <Answer
              key={d.id}
              detail={d}
              profiles={uniqueProfiles}
              initialProfile={old?.profile_id || ""}
              initialProfiles={
                old?.booking_answer_participants
                  ?.sort((a: any, b: any) => a.position - b.position)
                  .map((a: any) => a.profile_id) || []
              }
              initialQuestions={old?.questions || []}
              locked={Boolean(data?.booking?.data_submitted_at)}
              save={assign}
            />
          );
        })}
      </div>
      {(savingItems > 0 || submitWaiting) && (
        <p className="savingNotice">請勿切換畫面，資料正在儲存並送出，請稍候…</p>
      )}
      {!data?.booking?.data_submitted_at ? (
        <button
          className="submitAllData"
          onClick={() => {
            const missing = details.flatMap((d: any) =>
              storedAnswerMissing(
                d,
                data?.links?.find((x: any) => x.booking_detail_id === d.id),
                uniqueProfiles,
              ).map((field) => `${d.item_title}：${field}`),
            );
            if (missing.length) {
              setMissingItems(missing);
              return;
            }
            setConfirmSubmit(true);
          }}
        >
          確認無誤，送出資料
        </button>
      ) : (
        <div className="submittedNotice">
          資料已送出，如需修改請透過 LINE 聯絡助理。
        </div>
      )}
      {missingItems.length > 0 && (
        <div className="modalBackdrop">
          <div className="modal missingItemsModal">
            <h2>資料尚未填寫完整</h2>
            <p>請完成以下必填欄位後再送出：</p>
            <ul>
              {missingItems.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
            <button onClick={() => setMissingItems([])}>返回填寫</button>
          </div>
        </div>
      )}
      {confirmSubmit && (
        <div className="modalBackdrop">
          <div className="modal submitConfirm">
            <h2>送出前請再次確認</h2>
            <p>
              請再仔細確認所有資料是否正確。送出後將無法自行修改；若需要調整，請透過
              LINE 傳訊息聯絡助理，我們會協助您處理。
            </p>
            {msg && <p className="submitError">{msg}</p>}
            {(savingItems > 0 || submitWaiting || saving) && (
              <p className="savingNotice">請勿切換畫面，資料正在儲存並送出，請稍候…</p>
            )}
            <button onClick={() => void submitAll()} disabled={saving}>
              {saving ? "儲存傳送中…" : "確認無誤，正式送出"}
            </button>
            <button
              className="cancel"
              disabled={saving}
              onClick={() => setConfirmSubmit(false)}
            >
              返回檢查
            </button>
          </div>
        </div>
      )}
      {submitSuccess && (
        <div className="modalBackdrop">
          <div className="modal submitConfirm submitSuccessModal">
            <h2>資料已成功送出</h2>
            <p>後台已收到您的問事資料，系統將接續建立諮詢單。</p>
            {lineSendWarning && <p className="submitError">{lineSendWarning}</p>}
            <button onClick={returnToLine}>返回 LINE</button>
          </div>
        </div>
      )}
    </main>
  );
}
function Answer({
  detail,
  profiles,
  initialProfile,
  initialProfiles,
  initialQuestions,
  save,
  locked,
}: any) {
  const initialQuestionCount = Math.max(
    1,
    Math.min(
      3,
      initialQuestions.findLastIndex?.((q: string) => Boolean(q)) + 1 || 1,
    ),
  );
  const [profileId, setProfileId] = useState(initialProfile),
    [profileIds, setProfileIds] = useState<string[]>(
      initialProfiles.filter((id: string) => id !== initialProfile),
    ),
    [questions, setQuestions] = useState<string[]>(
      Array.from(
        { length: initialQuestionCount },
        (_, i) => initialQuestions[i] || "",
      ),
    ),
    [questionLimit, setQuestionLimit] = useState(false),
    [editingLossKey, setEditingLossKey] = useState<string | null>(null),
    [deletingLossKey, setDeletingLossKey] = useState<string | null>(null),
    [lossDraft, setLossDraft] = useState<any>(null),
    [savedLosses, setSavedLosses] = useState<any[]>([]),
    [extra, setExtra] = useState<any>(detail.answer_extra_data || {}),
    [targetQuestions, setTargetQuestions] = useState<Record<string, string[]>>(
      detail.answer_extra_data?.target_questions || {},
    ),
    [saved, setSaved] = useState(Boolean(initialProfile)),
    [open, setOpen] = useState(!initialProfile);
  const code = detail.booking_items?.code || "",
    sub =
      detail.booking_detail_sub_items
        ?.map((s: any) => s.sub_item_title)
        .join("、") || "",
    title = detail.item_title || "",
    infantSpirit = code === "infant-spirit" || title.includes("嬰靈"),
    deceasedPet =
      code.includes("pet") ||
      title.includes("過世寵物") ||
      title.includes("往生寵物"),
    kind =
      code === "deceased-relative"
        ? "deceased"
        : code.includes("pet")
          ? "pet"
          : "person",
    allowed = profiles.filter(
      (p: any) =>
        p.profile_type === kind &&
        (!infantSpirit || (p.gender === "女" && isAtLeast15(p.birth_date))),
    ),
    relation =
      code === "past-life-relationship" || title.includes("與他人前世關係"),
    personalLove = sub.includes("個人感情運") || title.includes("個人感情運"),
    marriage =
      (code === "marriage-bazi" ||
        title.includes("感情運勢") ||
        title.includes("合婚") ||
        title.includes("合八字") ||
        title.includes("關係合盤")) &&
      !personalLove,
    company = sub.includes("公司命名") || sub.includes("公司改名"),
    personalRenaming = code === "naming" && sub.includes("個人改名"),
    spiritual = code === "spiritual-interference" || title.includes("外靈干擾"),
    datePick = code === "date-time-selection",
    count = relation
      ? hasCount(sub, 3)
        ? 3
        : hasCount(sub, 2)
          ? 2
          : 1
      : marriage
        ? hasCount(sub, 3) ||
          sub.includes("看3位") ||
          sub.includes("增加2人") ||
          sub.includes("加看兩位")
          ? 3
          : hasCount(sub, 2) ||
              sub.includes("看2位") ||
              sub.includes("增加1人") ||
              sub.includes("加看一位")
            ? 2
            : 1
        : 1,
    ids = Array.from({ length: count }, (_, i) => profileIds[i] || ""),
    self = profiles.find((p: any) => p.relationship === "本人"),
    // 這三類資料必須由使用者明確選擇，不能在空白時套用「本人」。
    requiresExplicitProfile =
      infantSpirit || code === "deceased-relative" || deceasedPet,
    primaryId =
      profileId || (requiresExplicitProfile ? "" : self?.id) || "",
    hasDuplicate = [primaryId, ...ids]
      .filter(Boolean)
      .some((id, i, all) => all.indexOf(id) !== i);
  const newbornNaming =
      code === "naming" && (sub.includes("新生兒") || title.includes("新生兒")),
    home = code === "home-energy" || title.includes("陽宅"),
    lawsuit =
      code === "lawsuit-benefactor" ||
      title.includes("官司") ||
      title.includes("貴人"),
    overallFortune = code === "overall-fortune" || title.includes("整體運勢"),
    health =
      code === "health" ||
      code === "physical-health" ||
      title.includes("身體健康"),
    hideGenericQuestions =
      company ||
      code === "naming" ||
      title.includes("命名") ||
      title.includes("改名") ||
      lawsuit,
    infantMultiple =
      sub.includes("兩位嬰靈") ||
      sub.includes("二位嬰靈") ||
      sub.includes("含)以上") ||
      sub.includes("含）以上"),
    displaySub = infantSpirit && infantMultiple ? "兩位嬰靈(含)以上" : sub,
    personOptions = profiles.filter((p: any) => p.profile_type === "person"),
    personSelect = (
      value: string,
      key: string,
      label: string,
      gender?: string,
    ) => (
      <label>
        {label}
        <select
          disabled={locked}
          value={value || ""}
          onChange={(e) => change(key, e.target.value)}
        >
          <option value="">請選擇資料</option>
          {personOptions
            .filter((p: any) => !gender || p.gender === gender)
            .map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.relationship_detail || p.relationship}）
              </option>
            ))}
        </select>
      </label>
    );
  useEffect(() => {
    setProfileIds((previous) =>
      Array.from({ length: count }, (_, index) => previous[index] || ""),
    );
  }, [count]);
  useEffect(() => {
    if (!infantSpirit || !primaryId) {
      setSavedLosses([]);
      return;
    }
    const profile = profiles.find((p: any) => p.id === primaryId);
    setSavedLosses(
      Array.isArray(profile?.pregnancy_losses) ? profile.pregnancy_losses : [],
    );
  }, [infantSpirit, primaryId, profiles]);
  const lossKey = (loss: any) =>
    `${String(loss?.date || "").slice(0, 10)}|${loss?.accuracy || ""}|${loss?.shichen || ""}`;
  const persistLosses = async (list: any[]) => {
    const order =
        new URLSearchParams(window.location.search).get("order") || "",
      response = await fetch("/api/booking-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order,
          action: "update_pregnancy_losses",
          profileId: primaryId,
          pregnancy_losses: list,
        }),
      }),
      payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "流產日期儲存失敗");
    const profile = profiles.find((item: any) => item.id === primaryId);
    if (profile) profile.pregnancy_losses = payload.pregnancy_losses || list;
    return payload.pregnancy_losses || list;
  };
  const change = (key: string, value: any) => {
      setExtra({ ...extra, [key]: value });
      setSaved(false);
    },
    chooser = (id: string, i: number) => (
      <select
        disabled={locked}
        value={id || ""}
        onChange={(e) => {
          setProfileIds((previous) =>
            Array.from({ length: count }, (_, index) =>
              index === i ? e.target.value : previous[index] || "",
            ),
          );
          setSaved(false);
        }}
      >
        <option value="">請選擇資料</option>
        {profiles
          .filter((p: any) => p.profile_type === "person")
          .map((p: any) => (
            <option
              key={p.id}
              value={p.id}
              disabled={p.id !== id && [primaryId, ...ids].includes(p.id)}
            >
              {p.name}（{p.relationship_detail || p.relationship}）
            </option>
          ))}
      </select>
    ),
    targetSlot = (index: number) => (
      <span key={`${detail.id}-target-${index}`}>
        {chooser(ids[index] || "", index)}
      </span>
    );
  const complete = isAnswerComplete({
    profileId: primaryId,
    ids,
    hasDuplicate,
    relation,
    marriage,
    infantSpirit,
    infantMultiple,
    personalLove,
    newbornNaming,
    company,
    datePick,
    home,
    lawsuit,
    overallFortune,
    health,
    deceasedPet,
    code,
    extra,
  });
  if (saved && !open)
    return (
      <article className="answerCard collapsed">
        <div className="answerTitle">
          <span>{detail.item_title}</span>
          <small>{displaySub}</small>
        </div>
        <button
          className={`answerStatus ${complete ? "complete" : "incomplete"}`}
          aria-label={
            locked
              ? "查看"
              : complete
                ? "資料完整，點此編輯"
                : "資料尚未填完，點此編輯"
          }
          title={locked ? "查看" : complete ? "資料完整" : "尚有必填資料未完成"}
          onClick={() => setOpen(true)}
        >
          {locked ? "查看" : complete ? "✓" : "!"}
        </button>
      </article>
    );
  return (
    <article className="answerCard">
      <div className="answerTitle">
        <span>{detail.item_title}</span>
        <small>{displaySub}</small>
      </div>
      {relation || marriage ? (
        <div
          className="relationChooser"
          key={`${detail.id}-${count}`}
          data-target-count={count}
        >
          <label>
            這個項目是為誰諮詢？
            <select
              disabled={locked}
              value={primaryId}
              onChange={(e) => {
                const nextPrimary = e.target.value;
                setProfileId(nextPrimary);
                setProfileIds((previous) =>
                  Array.from({ length: count }, (_, index) =>
                    previous[index] === nextPrimary
                      ? ""
                      : previous[index] || "",
                  ),
                );
                setSaved(false);
              }}
            >
              <option value="">請選擇資料</option>
              {profiles
                .filter((p: any) => p.profile_type === "person")
                .map((p: any) => (
                  <option
                    key={p.id}
                    value={p.id}
                    disabled={p.id !== primaryId && ids.includes(p.id)}
                  >
                    {p.name}（{p.relationship_detail || p.relationship}）
                  </option>
                ))}
            </select>
          </label>
          <b>請選擇要觀看的對象（共 {count} 位）</b>
          {targetSlot(0)}
          {count >= 2 && targetSlot(1)}
          {count >= 3 && targetSlot(2)}
          {hasDuplicate && <em>同一位人不能重複選擇</em>}
        </div>
      ) : newbornNaming ? (
        <div className="extraFields newbornPeople">
          {personSelect(extra.mother_id, "mother_id", "請選擇寶寶的媽媽", "女")}
          {personSelect(extra.father_id, "father_id", "請選擇寶寶的爸爸", "男")}
          {personSelect(extra.baby_id, "baby_id", "請選擇寶寶")}
          <small className="babyProfileHint">
            請先於最上方『諮詢者資料』新增寶寶資料（姓名可填『還沒取』），再返回此處選取。
          </small>
        </div>
      ) : (
        <label>
          {company
            ? "請選擇公司負責人"
            : code === "deceased-relative"
              ? "請選擇過世親友"
              : deceasedPet
                ? "請選擇往生寵物"
                : infantSpirit
                  ? "請選擇孩子的媽媽"
                  : "這個項目是為誰諮詢？"}
          <select
            disabled={locked}
            value={profileId}
            onChange={(e) => {
              setProfileId(e.target.value);
              if (infantSpirit) {
                const p = profiles.find((x: any) => x.id === e.target.value);
                setExtra({ ...extra, pregnancy_losses: [] });
                setSavedLosses(
                  Array.isArray(p?.pregnancy_losses) ? p.pregnancy_losses : [],
                );
                setEditingLossKey(null);
                setLossDraft(null);
              }
              setSaved(false);
            }}
          >
            <option value="">請選擇資料</option>
            {allowed.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.relationship_detail || p.relationship}）
              </option>
            ))}
          </select>
        </label>
      )}
      {infantSpirit && primaryId && (
        <div className="extraFields pregnancyLossSection">
          {savedLosses.length > 0 && (
            <>
              <b>已儲存的流產日期</b>
              <div className="lossTags savedLossTags">
                {savedLosses.map((loss: any, i: number) => {
                  const selected = (extra.pregnancy_losses || []).some(
                    (item: any) => lossKey(item) === lossKey(loss),
                  );
                  return <div className="lossTagRow" key={`${lossKey(loss)}-${i}`}>
                    <button type="button" className={selected ? "selected" : ""} onClick={() => {
                      setEditingLossKey(null);
                      setLossDraft(null);
                      const current = extra.pregnancy_losses || [];
                      if (selected) {
                        change("pregnancy_losses", current.filter((item: any) => lossKey(item) !== lossKey(loss)));
                        return;
                      }
                      if (!infantMultiple && current.length >= 1) {
                        window.alert("一位嬰靈只能選擇一筆流產日期");
                        return;
                      }
                      change("pregnancy_losses", [...current, loss]);
                    }}>
                      {String(loss.date || "").slice(0, 10)}
                      {loss.shichen ? `・${loss.shichen}` : ""}
                    </button>
                    <button type="button" className="editLoss" aria-label="編輯這筆流產日期" onClick={() => {
                      setEditingLossKey(lossKey(loss));
                      setLossDraft({...loss});
                    }}>✎</button>
                  </div>;
                })}
              </div>
            </>
          )}
          {(infantMultiple || savedLosses.length < 1) && (
            <button
              type="button"
              className="addLossTime"
              onClick={() => {
                setEditingLossKey("__new__");
                setLossDraft({date:"",lunar:"",accuracy:"準確日期",shichen:"",notes:""});
              }}
            >
              ＋新增流產日期
            </button>
          )}
          {lossDraft && (
                <div className="lossDate">
                  <label>
                    國曆流產日期
                    <input
                      type="date"
                      value={String(lossDraft.date || "").slice(0, 10)}
                      onChange={(e) => {
                        const value=e.target.value;
                        setLossDraft({...lossDraft,date:value,lunar:value?lunarProfile(value).lunar_birth_text:""});
                      }}
                    />
                  </label>
                  <label className="readonly">
                    農曆流產日期
                    <input readOnly value={lossDraft.lunar || ""} />
                  </label>
                  <label>
                    該日期為
                    <select
                      value={lossDraft.accuracy || ""}
                      onChange={(e) => setLossDraft({...lossDraft,accuracy:e.target.value})}
                    >
                      <option value="">請選擇</option>
                      <option>準確日期</option>
                      <option>約略日期</option>
                    </select>
                  </label>
                  <label>
                    流產時辰
                    <select
                      value={lossDraft.shichen || ""}
                      onChange={(e) => setLossDraft({...lossDraft,shichen:e.target.value})}
                    >
                      <option value="">請選擇</option>
                      {times.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    備註
                    <textarea
                      placeholder="例如：只記得年跟月"
                      value={lossDraft.notes || ""}
                      onChange={(e) => setLossDraft({...lossDraft,notes:e.target.value})}
                    />
                  </label>
                  <div className="lossActions">
                    <button
                      type="button"
                      disabled={!lossDraft.date || !lossDraft.accuracy || !lossDraft.shichen}
                      onClick={async () => {
                        try {
                          const oldKey=editingLossKey,merged=savedLosses.filter((saved:any)=>oldKey==="__new__"||lossKey(saved)!==oldKey);
                          merged.push(lossDraft);
                          const persisted = await persistLosses(merged);
                          setSavedLosses(persisted);
                          const selected=(extra.pregnancy_losses||[]).filter((item:any)=>oldKey==="__new__"||lossKey(item)!==oldKey);
                          change("pregnancy_losses",infantMultiple?[...selected,lossDraft]:[lossDraft]);
                          setEditingLossKey(null);
                          setLossDraft(null);
                        } catch (error) {
                          window.alert(
                            error instanceof Error
                              ? error.message
                              : "流產日期儲存失敗",
                          );
                        }
                      }}
                    >
                      儲存該日期
                    </button>
                    <button
                      type="button"
                      className="deleteLoss"
                      onClick={() => editingLossKey==="__new__" ? (setEditingLossKey(null),setLossDraft(null)) : setDeletingLossKey(editingLossKey)}
                    >
                      刪除該日期
                    </button>
                  </div>
                </div>
          )}
        </div>
      )}
      {deletingLossKey !== null && (
        <div className="modalBackdrop lossDeleteConfirm">
          <div className="modal">
            <h2>確認刪除流產日期</h2>
            <p>刪除後將無法復原，確定要刪除這筆流產日期資料嗎？</p>
            <button
              type="button"
              onClick={async () => {
                try{
                  const stored=savedLosses.filter((item:any)=>lossKey(item)!==deletingLossKey);
                  const persisted=await persistLosses(stored);
                  setSavedLosses(persisted);
                  change("pregnancy_losses",(extra.pregnancy_losses||[]).filter((item:any)=>lossKey(item)!==deletingLossKey));
                  setDeletingLossKey(null);setEditingLossKey(null);setLossDraft(null);
                }catch(error){window.alert(error instanceof Error?error.message:"流產日期刪除失敗")}
              }}
            >
              確認刪除
            </button>
            <button
              type="button"
              className="cancel"
              onClick={() => setDeletingLossKey(null)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {overallFortune && (
        <div className="extraFields overallFocusFields">
          <h3>
            請在下方選項中，勾選 1～3 個你目前最想聚焦、最關心的具體事件：
          </h3>
          <div className="overallFocusOptions">
            {Object.keys(overallFocusFields).map((name) => {
              const selected = (extra.overall_focuses || []).includes(name);
              return (
                <label className={selected ? "selected" : ""} key={name}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={selected}
                    onChange={(e) => {
                      const current: string[] = extra.overall_focuses || [];
                      if (e.target.checked && current.length >= 3) {
                        window.alert("最多可選擇 3 個事件");
                        return;
                      }
                      const next = e.target.checked
                        ? [...current, name]
                        : current.filter((x) => x !== name);
                      change("overall_focuses", next);
                    }}
                  />
                  {name}
                </label>
              );
            })}
          </div>
          <small>請至少選擇 1 個，最多選擇 3 個。</small>
          {(extra.overall_focuses || []).map((name: string) => (
            <section className="overallFocusDetail" key={name}>
              <h4>{name}</h4>
              {(overallFocusFields[name] || []).map((field) => (
                <label key={field.label}>
                  {field.label}
                  <textarea
                    disabled={locked}
                    placeholder={field.placeholder}
                    value={
                      extra.overall_focus_details?.[name]?.[field.label] || ""
                    }
                    onChange={(e) =>
                      change("overall_focus_details", {
                        ...(extra.overall_focus_details || {}),
                        [name]: {
                          ...(extra.overall_focus_details?.[name] || {}),
                          [field.label]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
            </section>
          ))}
        </div>
      )}
      {health && (
        <div className="healthFields">
          <h3>當前關注的健康問題（可複選）</h3>
          <div className="healthConcernOptions">
            {[
              "睡眠／精神",
              "腸胃／消化",
              "心血管／頭痛",
              "骨骼／關節",
              "呼吸／過敏",
              "婦科／備孕",
              "情緒／壓力",
            ].map((name) => {
              const selected = (extra.health_concerns || []).includes(name);
              return (
                <label className={selected ? "selected" : ""} key={name}>
                  <input
                    type="checkbox"
                    disabled={locked}
                    checked={selected}
                    onChange={(e) =>
                      change(
                        "health_concerns",
                        e.target.checked
                          ? [...(extra.health_concerns || []), name]
                          : (extra.health_concerns || []).filter(
                              (x: string) => x !== name,
                            ),
                      )
                    }
                  />
                  <span>{name}</span>
                </label>
              );
            })}
          </div>
          <label>
            近期是否有手術或重大治療規劃？
            <select
              disabled={locked}
              value={extra.major_treatment_planned || ""}
              onChange={(e) =>
                change("major_treatment_planned", e.target.value)
              }
            >
              <option value="">請選擇</option>
              <option value="是">是</option>
              <option value="否">否</option>
            </select>
          </label>
          {extra.major_treatment_planned === "是" && (
            <div className="healthTreatmentFields">
              <label>
                想瞭解的問題
                <select
                  disabled={locked}
                  value={extra.treatment_question || ""}
                  onChange={(e) => change("treatment_question", e.target.value)}
                >
                  <option value="">請選擇</option>
                  {[
                    "目前的醫療團隊／主治醫師跟我有緣嗎？過程會不會順利？",
                    "手術後的恢復期運勢如何？能不能如期康復？",
                    "這段治療期間，命盤上有沒有什麼特別要注意的卡關或併發風險？",
                    "其他（自填）",
                  ].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              {extra.treatment_question === "其他（自填）" && (
                <label>
                  其他想瞭解的問題
                  <textarea
                    disabled={locked}
                    value={extra.treatment_question_other || ""}
                    onChange={(e) =>
                      change("treatment_question_other", e.target.value)
                    }
                  />
                </label>
              )}
              <label>
                備註
                <textarea
                  disabled={locked}
                  placeholder="若已有預定的『醫療機構／醫院名稱』與『主治醫師』，可以一併提供（例：台大醫院／陳宣醫師）。這能協助老師為您比對與該醫療團隊的契合度。"
                  value={extra.health_notes || ""}
                  onChange={(e) => change("health_notes", e.target.value)}
                />
              </label>
            </div>
          )}
        </div>
      )}
      {company && (
        <div className="extraFields">
          <p>為了幫您的公司選出最合適的名稱，請協助填寫以下資訊：</p>
          {sub.includes("公司改名") && (
            <label>
              公司目前名字（或舊名）
              <input
                value={extra.old_name || ""}
                onChange={(e) => change("old_name", e.target.value)}
              />
            </label>
          )}
          <label>
            主要業務與產品
            <textarea
              placeholder="例如：簡單說明公司是做什麼的、主要賣什麼或提供什麼服務即可"
              value={extra.business || ""}
              onChange={(e) => change("business", e.target.value)}
            />
          </label>
          <label>
            公司經營模式
            <select
              value={extra.mode || ""}
              onChange={(e) => change("mode", e.target.value)}
            >
              <option value="">請選擇</option>
              <option value="sole">獨資（自己一人開）</option>
              <option value="partners">合夥（有其他股東）</option>
            </select>
          </label>
          {extra.mode === "partners" && (
            <label>
              請選擇其他合夥人
              <select
                value={extra.partner || ""}
                onChange={(e) => change("partner", e.target.value)}
              >
                <option value="">請選擇</option>
                {profiles
                  .filter((p: any) => p.profile_type === "person")
                  .map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            命名喜好與禁忌
            <textarea
              placeholder="例如：希望名稱穩重、親切、現代，或想避開的風格"
              value={extra.preferences || ""}
              onChange={(e) => change("preferences", e.target.value)}
            />
          </label>
          <label>
            有沒有特別喜歡或想放進去的字？
            <input
              placeholder="例如：希望放入『安』、『盛』等字，或喜歡特定讀音"
              value={extra.favorite_words || ""}
              onChange={(e) => change("favorite_words", e.target.value)}
            />
          </label>
          <label>
            其他備註
            <textarea
              placeholder="例如：產業特色、品牌理念，或其他希望老師留意的事項"
              value={extra.notes || ""}
              onChange={(e) => change("notes", e.target.value)}
            />
          </label>
        </div>
      )}
      {datePick && (
        <div className="extraFields">
          <label>
            這次是要擇什麼日子呢？
            <select
              value={extra.purpose || ""}
              onChange={(e) => change("purpose", e.target.value)}
            >
              {[
                "",
                "結婚／登記",
                "手術／開刀",
                "開工／開業",
                "搬家／入宅",
                "動土／修造",
                "簽約／交易",
                "提車／交車",
                "安神／立壇",
                "出行／遠行",
                "喪葬／安葬",
                "其他",
              ].map((x) => (
                <option key={x}>{x || "請選擇"}</option>
              ))}
            </select>
          </label>
          {extra.purpose === "其他" && (
            <label>
              其他用途
              <input
                placeholder="例如：重要活動、儀式或其他用途"
                value={extra.other_purpose || ""}
                onChange={(e) => change("other_purpose", e.target.value)}
              />
            </label>
          )}
          <label>
            請說明您目前的狀況
            <textarea
              placeholder="例如：預計辦理的事情、參與對象與目前準備進度"
              value={extra.situation || ""}
              onChange={(e) => change("situation", e.target.value)}
            />
          </label>
          <label>
            指定日期範圍、忌諱或注意事項
            <textarea
              placeholder="例如：希望安排的期間，以及需要避開的日期或時段"
              value={extra.date_range || ""}
              onChange={(e) => change("date_range", e.target.value)}
            />
          </label>
          <label>
            地點（若無可不填）
            <input
              placeholder="例如：新北市林口區"
              value={extra.location || ""}
              onChange={(e) => change("location", e.target.value)}
            />
          </label>
          <label>
            其他想補充的說明或狀況
            <textarea
              placeholder="例如：家人時間限制，或希望老師特別留意的事項"
              value={extra.notes || ""}
              onChange={(e) => change("notes", e.target.value)}
            />
          </label>
        </div>
      )}
      {personalRenaming && (
        <div className="extraFields">
          <label>
            是否有特別想用的字或喜歡的讀音？
            <textarea
              placeholder="例如：喜歡『安』字、希望讀音溫柔好念"
              value={extra.preferred_characters || ""}
              onChange={(e) => change("preferred_characters", e.target.value)}
            />
          </label>
          <label>
            對名字的風格有沒有什麼想像？
            <textarea
              placeholder="例如：想要響亮一點、優雅一點，或有想避開的感覺"
              value={extra.name_style || ""}
              onChange={(e) => change("name_style", e.target.value)}
            />
          </label>
          <label>
            是否有禁忌或避諱的字或諧音？
            <textarea
              placeholder="例如：避開長輩同名、特定字或容易產生誤會的諧音"
              value={extra.name_taboo || ""}
              onChange={(e) => change("name_taboo", e.target.value)}
            />
          </label>
          <label>
            其他備註
            <textarea
              placeholder="例如：改名原因或其他希望老師留意的事項"
              value={extra.naming_notes || ""}
              onChange={(e) => change("naming_notes", e.target.value)}
            />
          </label>
        </div>
      )}
      {spiritual && (
        <div className="extraFields">
          <label>
            請簡述受到干擾的情況
            <textarea
              placeholder="例如：反覆做相似的夢、莫名不安，或在特定時間與地點感到異常"
              value={extra.interference_situation || ""}
              onChange={(e) => change("interference_situation", e.target.value)}
            />
          </label>
          <label>
            這樣的情況持續多久了？
            <input
              placeholder="例如：約三個月，或從搬家後開始"
              value={extra.interference_duration || ""}
              onChange={(e) => change("interference_duration", e.target.value)}
            />
          </label>
        </div>
      )}
      {personalLove && (
        <div className="extraFields">
          <label>
            目前感情狀態
            <textarea
              placeholder="例如：單身多久、剛分手沉澱中、空窗期較長等"
              value={extra.love_status || ""}
              onChange={(e) => change("love_status", e.target.value)}
            />
          </label>
          <label>
            目前的社交與生活型態
            <textarea
              placeholder="例如：生活圈固定不太出門、正積極使用交友軟體或參加活動等"
              value={extra.social_lifestyle || ""}
              onChange={(e) => change("social_lifestyle", e.target.value)}
            />
          </label>
        </div>
      )}
      {newbornNaming && (
        <div className="extraFields">
          <label>
            希望寶寶姓氏
            <input
              placeholder="例如：林"
              value={extra.baby_surname || ""}
              onChange={(e) => change("baby_surname", e.target.value)}
            />
          </label>
          <label>
            是否有特別想用的字或喜歡的讀音？
            <textarea
              placeholder="例如：希望使用「安」、「樂」等字，或喜歡ㄩ、ㄣ等讀音"
              value={extra.preferred_characters || ""}
              onChange={(e) => change("preferred_characters", e.target.value)}
            />
          </label>
          <label>
            對名字的風格有沒有什麼想像？
            <textarea
              placeholder="例如：想要響亮一點、優雅一點，還是有想避開的感覺？"
              value={extra.name_style || ""}
              onChange={(e) => change("name_style", e.target.value)}
            />
          </label>
          <label>
            是否有禁忌或避諱的字或諧音？
            <textarea
              placeholder="例如：避開長輩同名用字、不喜歡特定讀音，或避免不雅諧音"
              value={extra.name_taboo || ""}
              onChange={(e) => change("name_taboo", e.target.value)}
            />
          </label>
          <label>
            其他備註
            <textarea
              placeholder="若還有其他命名需求或希望老師留意的事項，請填寫在這裡"
              value={extra.naming_notes || ""}
              onChange={(e) => change("naming_notes", e.target.value)}
            />
          </label>
        </div>
      )}
      {(code === "deceased-relative" || deceasedPet) && (
        <div className="extraFields">
          <label>
            目前的困擾或遺憾
            <textarea
              placeholder={
                deceasedPet
                  ? "例如：近期常夢到牠、擔心牠離開時是否安心，或仍對牠的離開感到掛念"
                  : "例如：夢到對方感到不安、執著於某句沒說出口的話、對葬禮或後事安排感到疑慮"
              }
              value={extra.current_regret || ""}
              onChange={(e) => change("current_regret", e.target.value)}
            />
          </label>
          <label>
            這次諮詢最希望獲得什麼
            <textarea
              placeholder={
                deceasedPet
                  ? "例如：想了解牠目前是否安好，以及自己還能為牠做些什麼"
                  : "例如：確認對方現在過得好不好？"
              }
              value={extra.consultation_goal || ""}
              onChange={(e) => change("consultation_goal", e.target.value)}
            />
          </label>
        </div>
      )}
      {home && (
        <div className="extraFields">
          <label>
            本次諮詢的主要目的
            <textarea
              placeholder="例如：購屋前評估、裝修格局調整、搬入後想改善運勢…"
              value={extra.home_purpose || ""}
              onChange={(e) => change("home_purpose", e.target.value)}
            />
          </label>
          <label>
            目前住起來最困擾的問題
            <textarea
              placeholder="例如：睡眠不好、頻繁吵架、財運受阻、身體欠安…"
              value={extra.home_problem || ""}
              onChange={(e) => change("home_problem", e.target.value)}
            />
          </label>
        </div>
      )}
      {infantSpirit && (
        <div className="extraFields infantFields">
          <label>
            目前的心理或生活狀況
            <textarea
              placeholder="例如：經常夢見、身體長期不適、心理無法放下、情緒焦慮、感情或事業不順等"
              value={extra.current_condition || ""}
              onChange={(e) => change("current_condition", e.target.value)}
            />
          </label>
          <label>
            過去是否曾處理過
            <textarea
              placeholder="例如：是否做過超度、立牌位或相關儀式？"
              value={extra.previous_handling || ""}
              onChange={(e) => change("previous_handling", e.target.value)}
            />
          </label>
        </div>
      )}
      {lawsuit && (
        <div className="extraFields">
          <label>
            官司／糾紛類型
            <select
              value={extra.lawsuit_type || ""}
              onChange={(e) => change("lawsuit_type", e.target.value)}
            >
              {[
                "",
                "詐騙",
                "債務",
                "離婚",
                "合約",
                "侵權",
                "傷害",
                "交通事故",
                "其他",
              ].map((x) => (
                <option key={x}>{x || "請選擇"}</option>
              ))}
            </select>
          </label>
          {extra.lawsuit_type === "其他" && (
            <label>
              其他糾紛類型
              <input
                value={extra.other_lawsuit_type || ""}
                onChange={(e) => change("other_lawsuit_type", e.target.value)}
              />
            </label>
          )}
          <label>
            目前訴訟進度
            <select
              value={extra.lawsuit_progress || ""}
              onChange={(e) => change("lawsuit_progress", e.target.value)}
            >
              {["", "偵查中", "收到傳票", "準備開庭", "其他"].map((x) => (
                <option key={x}>{x || "請選擇"}</option>
              ))}
            </select>
          </label>
          {extra.lawsuit_progress === "其他" && (
            <label>
              其他訴訟進度
              <input
                value={extra.other_lawsuit_progress || ""}
                onChange={(e) =>
                  change("other_lawsuit_progress", e.target.value)
                }
              />
            </label>
          )}
          <label>
            下次開庭或調解日期
            <input
              type="date"
              value={extra.next_court_date || ""}
              onChange={(e) => change("next_court_date", e.target.value)}
            />
          </label>
          <label>
            事件簡述與爭議點
            <textarea
              placeholder="請用 2～3 句話簡單說明事情經過，以及雙方目前卡住的地方"
              value={extra.dispute_summary || ""}
              onChange={(e) => change("dispute_summary", e.target.value)}
            />
          </label>
          <label>
            目前是否有專業人士或他人協助
            <textarea
              placeholder="例如：已有委任律師、親友協調中，或是完全獨自面對"
              value={extra.professional_help || ""}
              onChange={(e) => change("professional_help", e.target.value)}
            />
          </label>
          <label>
            本次最想解答的核心問題
            <textarea
              placeholder="例如：這場官司勝算高嗎？該選擇和解還是告到底？身邊會出現幫忙的貴人嗎？"
              value={extra.core_question || ""}
              onChange={(e) => change("core_question", e.target.value)}
            />
          </label>
        </div>
      )}
      {relation || marriage ? (
        <div className="targetQuestionGroups">
          {ids.filter(Boolean).map((id: string) => {
            const primaryPerson = profiles.find((p: any) => p.id === primaryId),
              person = profiles.find((p: any) => p.id === id),
              left =
                primaryId === self?.id
                  ? "我"
                  : `「${primaryPerson?.name || "諮詢者"}」`,
              right =
                id === self?.id ? "我" : `「${person?.name || "這位對象"}」`,
              list = targetQuestions[id]?.length ? targetQuestions[id] : [""],
              relationshipData = extra.relationship_details?.[id] || {},
              changeRelationship = (key: string, value: string) =>
                change("relationship_details", {
                  ...(extra.relationship_details || {}),
                  [id]: { ...relationshipData, [key]: value },
                });
            return (
              <div className="targetQuestionBlock" key={id}>
                {marriage && (
                  <div className="extraFields relationshipFields">
                    <h3>
                      請選擇
                      {primaryId === self?.id
                        ? "我"
                        : `「${primaryPerson?.name || "諮詢者"}」`}
                      與
                      {id === self?.id
                        ? "我"
                        : `「${person?.name || "這位對象"}」`}
                      的關係狀態
                    </h3>
                    <label>
                      目前關係狀態
                      <select
                        value={relationshipData.relationship_status || ""}
                        onChange={(e) =>
                          changeRelationship(
                            "relationship_status",
                            e.target.value,
                          )
                        }
                      >
                        {[
                          "",
                          "單戀中",
                          "交往中",
                          "情侶吵架",
                          "分手想復合",
                          "曖昧卡住",
                          "複雜關係",
                          "其他",
                        ].map((x) => (
                          <option key={x}>{x || "請選擇"}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      這段關係多久了？
                      <input
                        value={relationshipData.relationship_duration || ""}
                        onChange={(e) =>
                          changeRelationship(
                            "relationship_duration",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <label>
                      這次最想解決的事件？
                      <textarea
                        placeholder="最近發生了什麼具體的事情，讓你決定來尋求建議？"
                        value={relationshipData.main_event || ""}
                        onChange={(e) =>
                          changeRelationship("main_event", e.target.value)
                        }
                      />
                    </label>
                    <label>
                      你最希望達成的目標？
                      <textarea
                        placeholder="例如：想挽回、想知道要不要停損、想改善溝通、想了解對方的真實想法"
                        value={relationshipData.relationship_goal || ""}
                        onChange={(e) =>
                          changeRelationship(
                            "relationship_goal",
                            e.target.value,
                          )
                        }
                      />
                    </label>
                    <QuestionFields
                      title={`關於${left}與${right}的感情問題，我想問`}
                      questions={list}
                      locked={locked}
                      change={(next: string[]) => {
                        setTargetQuestions({ ...targetQuestions, [id]: next });
                        setSaved(false);
                      }}
                    />
                  </div>
                )}
                {relation && (
                  <div className="extraFields relationshipFields">
                    <QuestionFields
                      title={`關於${left}與${right}的前世關係，我想問`}
                      questions={list}
                      locked={locked}
                      change={(next: string[]) => {
                        setTargetQuestions({ ...targetQuestions, [id]: next });
                        setSaved(false);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : hideGenericQuestions ? null : (
        <div
          className={`extraFields questionExtraFields ${infantSpirit ? "infantQuestions" : ""}`}
        >
          <QuestionFields
            title="想詢問的問題"
            placeholder={
              health
                ? "例如：下個月微創手術適合 A／B 哪家醫院？"
                : personalLove
                  ? "例如：未來一年內的桃花時機、適合自己的伴侶類型，或個人感情盲點等"
                  : infantSpirit
                    ? "例如：孩子現在過得好嗎？是否需要我們為他做些什麼幫助？"
                    : code === "past-life-personal" ||
                        title.includes("前世因果（個人）")
                      ? "例如：想知道我前世從事什麼職業？是否曾經結婚？有幾個孩子？"
                      : "輸入你想問的問題"
            }
            questions={questions}
            locked={locked}
            change={(next: string[]) => {
              setQuestions(next);
              setSaved(false);
            }}
          />
        </div>
      )}
      <button
        disabled={locked}
        onClick={async () => {
          const primary =
              relation || marriage
                ? primaryId
                : newbornNaming
                  ? extra.baby_id
                  : profileId,
            allQuestions =
              relation || marriage
                ? ids.flatMap((id: string) =>
                    targetQuestions[id]?.length ? targetQuestions[id] : [""],
                  )
                : hideGenericQuestions
                  ? []
                  : questions,
            nextExtra =
              relation || marriage
                ? { ...extra, target_questions: targetQuestions }
                : extra;
          setSaved(true);
          setOpen(false);
          const cannotPersist =
            !primary ||
            ((relation || marriage) && (ids.some((x) => !x) || hasDuplicate)) ||
            (newbornNaming &&
              (!extra.mother_id || !extra.father_id || !extra.baby_id));
          if (cannotPersist) return;
          if (
            !(await save(
              detail.id,
              primary,
              allQuestions,
              relation || marriage
                ? [primary, ...ids]
                : newbornNaming
                  ? [extra.mother_id, extra.father_id, extra.baby_id]
                  : undefined,
              nextExtra,
            ))
          ) {
            setSaved(false);
            setOpen(true);
          }
        }}
      >
        {locked ? "已送出" : "儲存這個項目"}
      </button>
    </article>
  );
}
function isAnswerComplete(value: any) {
  return answerMissingFields(value).length === 0;
}
function answerMissingFields(value: any) {
  const filled = (input: any) => String(input ?? "").trim().length > 0,
    { extra = value.extra || {} } = value,
    missing: string[] = [];
  if (!filled(value.profileId))
    missing.push(
      value.infantSpirit
        ? "請選擇孩子的媽媽"
        : value.code === "deceased-relative"
          ? "請選擇過世親友"
          : value.deceasedPet
            ? "請選擇過世寵物"
            : "請選擇問事者",
    );
  if (value.relation || value.marriage) {
    value.ids.forEach((id: string, index: number) => {
      if (!filled(id)) missing.push(`請選擇要觀看的對象（第 ${index + 1} 位）`);
    });
    if (value.hasDuplicate) missing.push("問事者與觀看對象不可重複");
  }
  if (value.marriage)
    value.ids.filter(Boolean).forEach((id: string, index: number) => {
      const row = extra.relationship_details?.[id] || {},
        prefix = `第 ${index + 1} 位對象`;
      if (!filled(row.relationship_status))
        missing.push(`${prefix}：目前關係狀態`);
    });
  if (value.infantSpirit) {
    const losses = extra.pregnancy_losses || [];
    const minimumLosses = value.infantMultiple ? 2 : 1;
    if (losses.length < minimumLosses)
      missing.push(
        value.infantMultiple
          ? "兩位嬰靈（含）以上至少需要選擇兩筆流產日期"
          : "請新增並選擇流產日期",
      );
    losses.forEach((loss: any, index: number) => {
      if (!filled(loss.date))
        missing.push(`流產日期 ${index + 1}：國曆流產日期`);
      if (!filled(loss.accuracy))
        missing.push(`流產日期 ${index + 1}：該日期為準確或約略日期`);
      if (!filled(loss.shichen))
        missing.push(`流產日期 ${index + 1}：流產時辰`);
    });
  }
  if (value.overallFortune) {
    const focuses = extra.overall_focuses || [];
    if (focuses.length < 1 || focuses.length > 3)
      missing.push("請選擇 1～3 個最關心的事件");
  }
  if (value.health) {
    if (!(extra.health_concerns || []).length)
      missing.push("當前關注的健康問題");
    if (!filled(extra.major_treatment_planned))
      missing.push("是否有手術或重大治療規劃");
    if (extra.major_treatment_planned === "是") {
      if (!filled(extra.treatment_question)) missing.push("想瞭解的治療問題");
      if (
        extra.treatment_question === "其他（自填）" &&
        !filled(extra.treatment_question_other)
      )
        missing.push("其他想瞭解的問題");
    }
  }
  if (value.newbornNaming) {
    if (!filled(extra.mother_id)) missing.push("請選擇寶寶的媽媽");
    if (!filled(extra.father_id)) missing.push("請選擇寶寶的爸爸");
    if (!filled(extra.baby_id)) missing.push("請選擇寶寶");
  }
  if (value.company) {
    if (!filled(extra.mode)) missing.push("公司經營模式");
    if (extra.mode === "partners" && !filled(extra.partner))
      missing.push("請選擇其他合夥人");
  }
  if (value.datePick) {
    if (!filled(extra.purpose)) missing.push("擇日用途");
    if (extra.purpose === "其他" && !filled(extra.other_purpose))
      missing.push("其他擇日用途");
  }
  if (value.lawsuit) {
    if (!filled(extra.lawsuit_type)) missing.push("官司／糾紛類型");
    if (extra.lawsuit_type === "其他" && !filled(extra.other_lawsuit_type))
      missing.push("其他糾紛類型");
    if (!filled(extra.lawsuit_progress)) missing.push("目前訴訟進度");
    if (
      extra.lawsuit_progress === "其他" &&
      !filled(extra.other_lawsuit_progress)
    )
      missing.push("其他訴訟進度");
  }
  return [...new Set(missing)];
}
function storedAnswerMissing(detail: any, answer: any, profiles: any[]) {
  if (!answer) return ["尚未儲存這個項目"];
  const code = detail.booking_items?.code || "",
    sub =
      detail.booking_detail_sub_items
        ?.map((item: any) => item.sub_item_title)
        .join("、") || "",
    title = detail.item_title || "",
    infantSpirit = code === "infant-spirit" || title.includes("嬰靈"),
    relation =
      code === "past-life-relationship" || title.includes("與他人前世關係"),
    personalLove = sub.includes("個人感情運") || title.includes("個人感情運"),
    marriage =
      (code === "marriage-bazi" ||
        title.includes("感情運勢") ||
        title.includes("合婚") ||
        title.includes("合八字") ||
        title.includes("關係合盤")) &&
      !personalLove,
    newbornNaming =
      code === "naming" && (sub.includes("新生兒") || title.includes("新生兒")),
    company = sub.includes("公司命名") || sub.includes("公司改名"),
    datePick = code === "date-time-selection",
    home = code === "home-energy" || title.includes("陽宅"),
    lawsuit =
      code === "lawsuit-benefactor" ||
      title.includes("官司") ||
      title.includes("貴人"),
    overallFortune = code === "overall-fortune" || title.includes("整體運勢"),
    health =
      code === "health" ||
      code === "physical-health" ||
      title.includes("身體健康"),
    deceasedPet =
      code.includes("pet") ||
      title.includes("過世寵物") ||
      title.includes("往生寵物"),
    infantMultiple =
      sub.includes("兩位嬰靈") ||
      sub.includes("二位嬰靈") ||
      sub.includes("含)以上") ||
      sub.includes("含）以上"),
    count = relation
      ? hasCount(sub, 3)
        ? 3
        : hasCount(sub, 2)
          ? 2
          : 1
      : marriage
        ? hasCount(sub, 3) ||
          sub.includes("看3位") ||
          sub.includes("增加2人") ||
          sub.includes("加看兩位")
          ? 3
          : hasCount(sub, 2) ||
              sub.includes("看2位") ||
              sub.includes("增加1人") ||
              sub.includes("加看一位")
            ? 2
            : 1
        : 1,
    participants = (answer.booking_answer_participants || [])
      .slice()
      .sort((a: any, b: any) => a.position - b.position)
      .map((row: any) => row.profile_id),
    profileId = answer.profile_id || "",
    ids = participants.filter((id: string) => id !== profileId).slice(0, count);
  while (ids.length < count) ids.push("");
  const self = profiles.find((profile: any) => profile.relationship === "本人"),
    requiresExplicitProfile =
      infantSpirit || code === "deceased-relative" || deceasedPet,
    primaryId =
      profileId || (requiresExplicitProfile ? "" : self?.id) || "",
    hasDuplicate = [primaryId, ...ids]
      .filter(Boolean)
      .some((id, index, all) => all.indexOf(id) !== index);
  return answerMissingFields({
    profileId: primaryId,
    ids,
    hasDuplicate,
    relation,
    marriage,
    infantSpirit,
    infantMultiple,
    personalLove,
    newbornNaming,
    company,
    datePick,
    home,
    lawsuit,
    overallFortune,
    health,
    deceasedPet,
    code,
    extra: answer.extra_data || {},
  });
}
function hasCount(text: string, count: number) {
  const patterns =
    count === 3
      ? ["3人", "三人", "3位", "三位", "共3", "共 3", "共三", "三個", "three"]
      : [
          "2人",
          "兩人",
          "二人",
          "2位",
          "兩位",
          "二位",
          "共2",
          "共 2",
          "共兩",
          "共二",
          "兩個",
          "二個",
          "two",
        ];
  return patterns.some((value) =>
    text.toLowerCase().includes(value.toLowerCase()),
  );
}
function isAtLeast15(birthDate: string) {
  if (!birthDate) return false;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return false;
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 15);
  return birth <= cutoff;
}
function QuestionFields({
  title,
  questions,
  locked,
  change,
  placeholder = "輸入你想問的問題",
}: any) {
  const [limit, setLimit] = useState(false);
  return (
    <div className="questions">
      <b>{title}</b>
      {questions.map((q: string, i: number) => (
        <textarea
          disabled={locked}
          key={i}
          placeholder={placeholder}
          value={q}
          onChange={(e) =>
            change(
              questions.map((x: string, n: number) =>
                n === i ? e.target.value : x,
              ),
            )
          }
        />
      ))}
      {!locked && (
        <button
          type="button"
          className="addQuestion"
          onClick={() => {
            if (questions.length >= 3) {
              setLimit(true);
              return;
            }
            change([...questions, ""]);
            setLimit(false);
          }}
        >
          ＋新增其他問題
        </button>
      )}
      {limit && (
        <small className="questionLimit">
          已超過上限，每位對象最多可填寫三個問題
        </small>
      )}
    </div>
  );
}
