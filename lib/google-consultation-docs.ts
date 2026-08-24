import crypto from "node:crypto";

const folderId = process.env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID || process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID || "";
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const appsScriptSetting = (process.env.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
const appsScriptUrl = appsScriptSetting && !/^https?:\/\//i.test(appsScriptSetting)
  ? `https://script.google.com/macros/s/${appsScriptSetting.replace(/^\/+|\/+$/g, "")}/exec`
  : appsScriptSetting;
const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";
const requiredAppsScriptVersion = "2026-08-24-v5";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const text = (value: unknown) => String(value ?? "").trim();
const one = (value: any) => Array.isArray(value) ? value[0] : value;

async function accessToken() {
  if (!email || !privateKey) throw new Error("尚未設定 Google 服務帳號環境變數");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/documents",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(unsigned);
  sign.end();
  const assertion = `${unsigned}.${sign.sign(privateKey, "base64url")}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error_description || "無法連線 Google");
  return result.access_token as string;
}

async function google(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers || {}) },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Google API 操作失敗");
  return result;
}

const labels: Record<string, string> = {
  relationship: "資料分類", relationship_detail: "與我的關係", gender: "性別",
  birth_date: "國曆生日", lunar_birth_text: "農曆生日", zodiac: "生肖",
  birth_shichen: "出生時辰", address: "居住地址", death_date: "國曆往生日期",
  lunar_death_text: "農曆往生日期", death_shichen: "往生時辰", notes: "備註",
  relationship_status: "目前關係狀態", relationship_duration: "這段關係多久了",
  main_event: "這次最想解決的事件", relationship_goal: "最希望達成的目標",
  overall_focuses: "目前最關心的事件", overall_focus_details: "事件詳細資料",
};

function extraLines(value: unknown, prefix = ""): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => extraLines(entry, `${prefix}${prefix ? " " : ""}${index + 1}`));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => extraLines(entry, `${prefix}${prefix ? "－" : ""}${labels[key] || key}`));
  return [`${prefix || "其他資料"}：${text(value)}`];
}

const shichenName = (value: unknown) => text(value).split(/[（(]/)[0];
const profileLines = (profile: any, ownerName: string) => {
  const profileName = text(profile.name);
  const relationshipDetail = text(profile.relationship_detail);
  // 舊資料有些親友的 relationship 曾被存成「本人」，因此不能只看這個欄位。
  // 必須同時符合姓名、沒有親友關係備註，才是真正的預約人本人。
  const isOwner = profile.relationship === "本人"
    && !relationshipDetail
    && !!ownerName
    && profileName === ownerName;
  const relation = isOwner
    ? "本人"
    : `${ownerName || "用戶"}的${relationshipDetail || (profile.relationship === "本人" ? "親友" : text(profile.relationship || "親友"))}`;
  const nameLine = `姓名：${profileName}${profile.gender ? `／${text(profile.gender)}` : ""}${relation ? `（${relation}）` : ""}`;
  const lunarLine = profile.lunar_birth_text
    ? `農曆生日：${text(profile.lunar_birth_text)}${profile.birth_shichen ? `（${shichenName(profile.birth_shichen)}）` : ""}${profile.zodiac ? `　生肖：${text(profile.zodiac)}` : ""}`
    : "";
  return [
    nameLine,
    lunarLine,
    profile.address ? `居住地址：${text(profile.address)}` : "",
    profile.lunar_death_text ? `農曆往生日期：${text(profile.lunar_death_text)}${profile.death_shichen ? `（${shichenName(profile.death_shichen)}）` : ""}` : "",
    profile.notes ? `備註：${text(profile.notes)}` : "",
  ].filter(Boolean);
};

type Mark = { start: number; end: number; kind: "meta" | "title" | "section" | "question" | "answer" };
function documentBody(detail: any, itemIndex: number, totalItems: number, ownerName: string) {
  let content = "";
  const marks: Mark[] = [];
  const add = (line: string, kind?: Mark["kind"]) => {
    const start = content.length + 1;
    content += `${line}\n`;
    if (kind) marks.push({ start, end: start + line.length, kind });
  };
  add(`項目 ${itemIndex}（共 ${totalItems} 個項目）`, "meta");
  const subItems = (detail.booking_detail_sub_items || []).map((entry: any) => text(entry.sub_item_title)).filter(Boolean);
  add([text(detail.item_title), subItems.join("、")].filter(Boolean).join("｜"), "title");
  add("");
  const answer = one(detail.booking_consultation_answers);
  const participants = (answer?.booking_answer_participants || []).slice().sort((a: any, b: any) => a.position - b.position);
  const people = [one(answer?.consultation_profiles), ...participants.map((entry: any) => one(entry.consultation_profiles))]
    .filter(Boolean).filter((profile: any, index: number, all: any[]) => all.findIndex((entry) => entry.id === profile.id) === index);
  people.forEach((profile: any) => {
    profileLines(profile, ownerName).forEach((line) => add(line));
    const omitted = new Set(["id", "customer_id", "created_at", "updated_at", "name", "profile_type", "relationship", "relationship_detail", "gender", "birth_date", "lunar_birth_text", "zodiac", "birth_shichen", "address", "photo_data", "death_date", "lunar_death_text", "death_shichen", "notes", "is_lunar", "owner_profile_id"]);
    extraLines(Object.fromEntries(Object.entries(profile).filter(([key]) => !omitted.has(key)))).forEach((line) => add(line));
    add("");
  });
  (answer?.questions || []).map(text).filter(Boolean).forEach((question: string, index: number) => {
    add(`Q${index + 1}:${question}`, "question");
    add(`A${index + 1}:`, "answer");
    add("");
  });
  extraLines(answer?.extra_data || {}).forEach((line) => add(line));
  add("");
  const subTitle = subItems.join("、");
  const sections = /前三世|三世/.test(subTitle)
    ? ["【前前前世】", "【前前世】", "【前世】", "【綜觀今生】"]
    : /前兩世|二世/.test(subTitle)
      ? ["【前前世】", "【前世】", "【綜觀今生】"]
      : ["【前世】", "【綜觀今生】"];
  sections.forEach((heading) => {
    add(heading, "section");
    add(""); add(""); add(""); add("");
  });
  return { content, marks };
}

function consultationNumber(position: number) {
  const safe = Math.max(1, position);
  const letterIndex = Math.floor((safe - 1) / 99);
  if (letterIndex > 25) throw new Error("諮詢單編號已超過 Z99，請新增編號規則");
  return `${String.fromCharCode(65 + letterIndex)}${String(((safe - 1) % 99) + 1).padStart(2, "0")}`;
}

export async function createConsultationDocuments(db: any, bookingId: string, bookingNo: string, force = false) {
  const { data: booking } = await db.from("bookings").select("customers(line_display_name,full_name)").eq("id", bookingId).single();
  const customer = one(booking?.customers) || {};
  const lineName = text(customer.line_display_name) || "LINE用戶";
  const ownerName = text(customer.full_name) || lineName;
  const { data: details, error } = await db.from("booking_details").select(`
    id,item_title,created_at,google_document_id,google_document_created_at,
    booking_items(code),booking_detail_sub_items(sub_item_title),
    booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(*),booking_answer_participants(position,consultation_profiles(*)))
  `).eq("booking_id", bookingId).order("created_at", { ascending: true });
  if (error) throw error;
  const allDetails = details || [];
  const targetIndex = allDetails.findIndex((detail: any) => {
    const item = one(detail.booking_items);
    return item?.code === "past-life-personal" || text(detail.item_title).includes("前世因果（個人）");
  });
  if (targetIndex < 0) return;
  const detail = allDetails[targetIndex];
  if (detail.google_document_id && !force) return;
  if (!folderId) throw new Error("尚未設定 GOOGLE_DRIVE_OUTPUT_FOLDER_ID");
  const { content, marks } = documentBody(detail, targetIndex + 1, allDetails.length, ownerName);
  const { data: numberedDocuments, error: numberError } = await db.from("booking_details")
    .select("id,google_document_created_at")
    .not("google_document_id", "is", null)
    .order("google_document_created_at", { ascending: true });
  if (numberError) throw numberError;
  const existingPosition = (numberedDocuments || []).findIndex((row: any) => row.id === detail.id);
  const documentPosition = existingPosition >= 0 ? existingPosition + 1 : (numberedDocuments || []).length + 1;
  const fileTitle = `${consultationNumber(documentPosition)}-${lineName}-${ownerName}`;
  if (appsScriptUrl) {
    if (!appsScriptSecret) throw new Error("尚未設定 GOOGLE_APPS_SCRIPT_SECRET");
    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: appsScriptSecret, expectedVersion: requiredAppsScriptVersion, folderId, title: fileTitle, content, marks, previousDocumentId: force ? detail.google_document_id : "" }),
      redirect: "follow",
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Apps Script 建立文件失敗");
    if (result.version !== requiredAppsScriptVersion) throw new Error(`目前連到舊版 Google Apps Script（目前：${result.version || "無版本資訊"}；需要：${requiredAppsScriptVersion}），請更新 Vercel 的 GOOGLE_APPS_SCRIPT_WEB_APP_URL 後重新部署`);
    const { error: updateError } = await db.from("booking_details").update({
      google_document_id: result.documentId,
      google_document_url: result.documentUrl,
      google_document_created_at: detail.google_document_created_at || new Date().toISOString(),
    }).eq("id", detail.id);
    if (updateError) throw updateError;
    return;
  }
  const token = await accessToken();
  const document = await google("https://docs.googleapis.com/v1/documents", token, {
    method: "POST", body: JSON.stringify({ title: fileTitle }),
  });
  await google(`https://www.googleapis.com/drive/v3/files/${document.documentId}?addParents=${encodeURIComponent(folderId)}&fields=id,parents&supportsAllDrives=true`, token, { method: "PATCH", body: "{}" });
  const requests: any[] = [
    { insertText: { location: { index: 1 }, text: content } },
    { updateDocumentStyle: { documentStyle: { marginTop: { magnitude: 28.3465, unit: "PT" }, marginBottom: { magnitude: 28.3465, unit: "PT" }, marginLeft: { magnitude: 28.3465, unit: "PT" }, marginRight: { magnitude: 28.3465, unit: "PT" } }, fields: "marginTop,marginBottom,marginLeft,marginRight" } },
    { updateTextStyle: { range: { startIndex: 1, endIndex: content.length + 1 }, textStyle: { weightedFontFamily: { fontFamily: "Arial" }, fontSize: { magnitude: 14, unit: "PT" } }, fields: "weightedFontFamily,fontSize" } },
  ];
  for (const mark of marks) {
    const style = mark.kind === "meta"
      ? { foregroundColor: { color: { rgbColor: { red: .45, green: .42, blue: .4 } } }, fontSize: { magnitude: 10, unit: "PT" } }
      : mark.kind === "title"
        ? { bold: true, fontSize: { magnitude: 20, unit: "PT" }, foregroundColor: { color: { rgbColor: { red: .42, green: .23, blue: .14 } } } }
        : mark.kind === "question"
          ? { bold: true }
          : mark.kind === "answer"
            ? { bold: false, foregroundColor: { color: { rgbColor: { red: .1, green: .35, blue: .8 } } } }
            : { bold: true, fontSize: { magnitude: 18, unit: "PT" }, foregroundColor: { color: { rgbColor: { red: .55, green: .12, blue: .22 } } } };
    requests.push({ updateTextStyle: { range: { startIndex: mark.start, endIndex: mark.end }, textStyle: style, fields: "*" } });
  }
  await google(`https://docs.googleapis.com/v1/documents/${document.documentId}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) });
  const { error: updateError } = await db.from("booking_details").update({
    google_document_id: document.documentId,
    google_document_url: `https://docs.google.com/document/d/${document.documentId}/edit`,
    google_document_created_at: detail.google_document_created_at || new Date().toISOString(),
  }).eq("id", detail.id);
  if (updateError) throw updateError;
}
