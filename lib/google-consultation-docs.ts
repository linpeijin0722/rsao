import crypto from "node:crypto";

const folderId = process.env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID || process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID || "";
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const appsScriptSetting = (process.env.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
const appsScriptUrl = appsScriptSetting && !/^https?:\/\//i.test(appsScriptSetting)
  ? `https://script.google.com/macros/s/${appsScriptSetting.replace(/^\/+|\/+$/g, "")}/exec`
  : appsScriptSetting;
const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";
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
};

function extraLines(value: unknown, prefix = ""): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => extraLines(entry, `${prefix}${prefix ? " " : ""}${index + 1}`));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, entry]) => extraLines(entry, `${prefix}${prefix ? "－" : ""}${labels[key] || key}`));
  return [`${prefix || "其他資料"}：${text(value)}`];
}

const profileLines = (profile: any, index: number, total: number) => {
  const heading = total > 1 ? `諮詢者 ${index + 1}` : "諮詢者資料";
  const rows = [
    `${heading}－姓名：${text(profile.name)}`,
    `資料分類：${text(profile.relationship)}`,
    profile.relationship_detail ? `與我的關係：${text(profile.relationship_detail)}` : "",
    `性別：${text(profile.gender)}`,
    `國曆生日：${text(profile.birth_date)}`,
    `農曆生日：${text(profile.lunar_birth_text)}`,
    `生肖：${text(profile.zodiac)}`,
    `出生時辰：${text(profile.birth_shichen)}`,
    `居住地址：${text(profile.address)}`,
  ].filter((line) => !line.endsWith("："));
  return rows;
};

type Mark = { start: number; end: number; kind: "meta" | "title" | "section" };
function documentBody(detail: any, itemIndex: number, totalItems: number) {
  let content = "";
  const marks: Mark[] = [];
  const add = (line: string, kind?: Mark["kind"]) => {
    const start = content.length + 1;
    content += `${line}\n`;
    if (kind) marks.push({ start, end: start + line.length, kind });
  };
  add(`項目 ${itemIndex}（共 ${totalItems} 個項目）`, "meta");
  add(text(detail.item_title), "title");
  const subItems = (detail.booking_detail_sub_items || []).map((entry: any) => text(entry.sub_item_title)).filter(Boolean);
  if (subItems.length) add(`子項目：${subItems.join("、")}`);
  add("");
  const answer = one(detail.booking_consultation_answers);
  const participants = (answer?.booking_answer_participants || []).slice().sort((a: any, b: any) => a.position - b.position);
  const people = [one(answer?.consultation_profiles), ...participants.map((entry: any) => one(entry.consultation_profiles))]
    .filter(Boolean).filter((profile: any, index: number, all: any[]) => all.findIndex((entry) => entry.id === profile.id) === index);
  people.forEach((profile: any, index: number) => {
    profileLines(profile, index, people.length).forEach((line) => add(line));
    const omitted = new Set(["id", "customer_id", "created_at", "updated_at", "name", "profile_type", "relationship", "relationship_detail", "gender", "birth_date", "lunar_birth_text", "zodiac", "birth_shichen", "address", "photo_data"]);
    extraLines(Object.fromEntries(Object.entries(profile).filter(([key]) => !omitted.has(key)))).forEach((line) => add(line));
    add("");
  });
  (answer?.questions || []).map(text).filter(Boolean).forEach((question: string, index: number) => add(`問題 ${index + 1}：${question}`));
  extraLines(answer?.extra_data || {}).forEach((line) => add(line));
  add("");
  ["【前前世】", "【前世】", "【綜觀今生】"].forEach((heading) => {
    add(heading, "section");
    add("老師回覆：");
    add(""); add(""); add(""); add("");
  });
  return { content, marks };
}

export async function createConsultationDocuments(db: any, bookingId: string, bookingNo: string, force = false) {
  const { data: details, error } = await db.from("booking_details").select(`
    id,item_title,created_at,google_document_id,
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
  const { content, marks } = documentBody(detail, targetIndex + 1, allDetails.length);
  if (appsScriptUrl) {
    if (!appsScriptSecret) throw new Error("尚未設定 GOOGLE_APPS_SCRIPT_SECRET");
    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: appsScriptSecret, folderId, title: `${bookingNo}－${detail.item_title}`, content, marks, previousDocumentId: force ? detail.google_document_id : "" }),
      redirect: "follow",
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Apps Script 建立文件失敗");
    const { error: updateError } = await db.from("booking_details").update({
      google_document_id: result.documentId,
      google_document_url: result.documentUrl,
      google_document_created_at: new Date().toISOString(),
    }).eq("id", detail.id);
    if (updateError) throw updateError;
    return;
  }
  const token = await accessToken();
  const document = await google("https://docs.googleapis.com/v1/documents", token, {
    method: "POST", body: JSON.stringify({ title: `${bookingNo}－${detail.item_title}` }),
  });
  await google(`https://www.googleapis.com/drive/v3/files/${document.documentId}?addParents=${encodeURIComponent(folderId)}&fields=id,parents&supportsAllDrives=true`, token, { method: "PATCH", body: "{}" });
  const requests: any[] = [
    { insertText: { location: { index: 1 }, text: content } },
    { updateTextStyle: { range: { startIndex: 1, endIndex: content.length + 1 }, textStyle: { weightedFontFamily: { fontFamily: "Noto Sans TC" }, fontSize: { magnitude: 14, unit: "PT" } }, fields: "weightedFontFamily,fontSize" } },
  ];
  for (const mark of marks) {
    const style = mark.kind === "meta"
      ? { foregroundColor: { color: { rgbColor: { red: .45, green: .42, blue: .4 } } }, fontSize: { magnitude: 10, unit: "PT" } }
      : mark.kind === "title"
        ? { bold: true, fontSize: { magnitude: 20, unit: "PT" } }
        : { bold: true, fontSize: { magnitude: 18, unit: "PT" }, foregroundColor: { color: { rgbColor: { red: .55, green: .12, blue: .22 } } } };
    requests.push({ updateTextStyle: { range: { startIndex: mark.start, endIndex: mark.end }, textStyle: style, fields: "*" } });
  }
  await google(`https://docs.googleapis.com/v1/documents/${document.documentId}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) });
  const { error: updateError } = await db.from("booking_details").update({
    google_document_id: document.documentId,
    google_document_url: `https://docs.google.com/document/d/${document.documentId}/edit`,
    google_document_created_at: new Date().toISOString(),
  }).eq("id", detail.id);
  if (updateError) throw updateError;
}
