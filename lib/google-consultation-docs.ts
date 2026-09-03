import crypto from "node:crypto";

const folderId = process.env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID || process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID || "";
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const appsScriptSetting = (process.env.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
const appsScriptUrl = appsScriptSetting && !/^https?:\/\//i.test(appsScriptSetting)
  ? `https://script.google.com/macros/s/${appsScriptSetting.replace(/^\/+|\/+$/g, "")}/exec`
  : appsScriptSetting;
const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";
const requiredAppsScriptVersion = "2026-09-03-v12";
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

async function normalizeDocumentHeaderAndFooter(documentId: string, bookingNo: string) {
  const token = await accessToken();
  const document = await google(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
    token,
  );
  const requests: any[] = [{
    updateDocumentStyle: {
      documentStyle: {
        marginHeader: { magnitude: 14.1732, unit: "PT" },
        marginFooter: { magnitude: 14.1732, unit: "PT" },
      },
      fields: "marginHeader,marginFooter",
    },
  }];
  // Google Docs 的頁首頁尾 ID 位於各 sectionBreak.sectionStyle，並不在 documentStyle。
  // 舊版讀錯位置，導致一直找不到模板既有的頁首／頁尾，格式更新也因此沒有生效。
  const collectSegmentIds = (sourceDocument: any, kind: "Header" | "Footer") => {
    const sectionStyles = (sourceDocument.body?.content || [])
      .map((block: any) => block.sectionBreak?.sectionStyle)
      .filter(Boolean);
    const ids = Array.from(new Set(
      sectionStyles.flatMap((style: any) => [
        style[`default${kind}Id`],
        style[`firstPage${kind}Id`],
        style[`evenPage${kind}Id`],
      ]).filter(Boolean),
    )) as string[];
    const segments = kind === "Header" ? sourceDocument.headers : sourceDocument.footers;
    return Array.from(new Set([...ids, ...Object.keys(segments || {})]));
  };
  const headerIds = collectSegmentIds(document, "Header");
  const footerIds = collectSegmentIds(document, "Footer");
  // 保留模板原本的頁首區段，清空內容後直接寫入訂單編號，避免刪除後重新建立時
  // Google API 偶爾未回傳 headerId。頁尾則整段刪除，不保留任何內容。
  for (const footerId of footerIds) requests.push({ deleteFooter: { footerId } });
  const existingHeaderId = headerIds[0];
  if (existingHeaderId) {
    const headerContent = document.headers?.[existingHeaderId]?.content || [];
    const headerEnd = Math.max(1, ...headerContent.map((block: any) => Number(block.endIndex || 1)));
    if (headerEnd > 1) requests.push({ deleteContentRange: { range: { segmentId: existingHeaderId, startIndex: 0, endIndex: headerEnd - 1 } } });
  }

  // 「整體運勢」最下方的備註是固定說明，不是老師輸入區。
  // Apps Script 會先套用共用樣式，這裡再精準覆蓋成黑色 10pt。
  const bodyRuns: Array<{ text: string; start: number; end: number }> = [];
  for (const block of document.body?.content || []) {
    for (const element of block.paragraph?.elements || []) {
      const runText = String(element.textRun?.content || "");
      if (runText && Number.isFinite(element.startIndex) && Number.isFinite(element.endIndex)) {
        bodyRuns.push({ text: runText, start: Number(element.startIndex), end: Number(element.endIndex) });
      }
    }
  }
  const flatBody = bodyRuns.map((run) => run.text).join("");
  const locateBodyOffset = (offset: number) => {
    let cursor = 0;
    for (const run of bodyRuns) {
      const next = cursor + run.text.length;
      if (offset < next) return run.start + (offset - cursor);
      cursor = next;
    }
    return bodyRuns.at(-1)?.end || 1;
  };
  // 視訊諮詢單最上方兩行是老師辨識預約的重點資訊，固定套用指定紅色。
  // 這裡直接透過 Docs API 覆蓋，避免 Apps Script 的一般標題樣式把它改成咖啡色。
  const videoHeader = flatBody.match(/\d{4}\/\d{1,2}\/\d{1,2}\([一二三四五六日]\)(?:上午|中午|下午)\d{2}:\d{2}\nLINE名稱：[^\n]+｜視訊時間：\d+分鐘/);
  if (videoHeader) {
    const videoHeaderOffset = flatBody.indexOf(videoHeader[0]);
    requests.push({
      updateTextStyle: {
        range: { startIndex: locateBodyOffset(videoHeaderOffset), endIndex: locateBodyOffset(videoHeaderOffset + videoHeader[0].length) },
        textStyle: {
          foregroundColor: { color: { rgbColor: { red: 0.8, green: 0, blue: 0 } } },
          fontSize: { magnitude: 20, unit: "PT" },
          bold: true,
        },
        fields: "foregroundColor,fontSize,bold",
      },
    });
  }
  const noteText = "備註：\n1.以上均為虛歲\n2.如果沒有特別提到的年紀，代表身體狀況大致平順，不需要特別擔心，只要維持日常保養即可。\n3.運勢中的歲數，僅代表在那個年齡段需要特別留意的事項（非今生會活到幾歲喔） 若遇到劫難的時候就要比較小心，通過自己的努力衝過難關，多做福德佈施，化解災劫也能夠延續生命。";
  let noteOffset = flatBody.indexOf(noteText);
  while (noteOffset >= 0) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: locateBodyOffset(noteOffset), endIndex: locateBodyOffset(noteOffset + noteText.length) },
        textStyle: {
          foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
          fontSize: { magnitude: 10, unit: "PT" },
          bold: false,
        },
        fields: "foregroundColor,fontSize,bold",
      },
    });
    noteOffset = flatBody.indexOf(noteText, noteOffset + noteText.length);
  }
  await google(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    token,
    { method: "POST", body: JSON.stringify({ requests }) },
  );
  let createdHeaderId = existingHeaderId;
  if (!createdHeaderId) {
    const createHeaderResult = await google(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
      token,
      { method: "POST", body: JSON.stringify({ requests: [{ createHeader: { type: "DEFAULT" } }] }) },
    );
    createdHeaderId = createHeaderResult.replies?.[0]?.createHeader?.headerId;
    if (!createdHeaderId) {
      const refreshedDocument = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
      createdHeaderId = collectSegmentIds(refreshedDocument, "Header")[0];
    }
  }
  if (!createdHeaderId) throw new Error("Google 文件頁首建立失敗");
  const headerText = `訂單編號：${bookingNo}`;
  await google(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ requests: [
        { insertText: { location: { segmentId: createdHeaderId, index: 0 }, text: headerText } },
        {
          updateParagraphStyle: {
            range: { segmentId: createdHeaderId, startIndex: 0, endIndex: headerText.length },
            paragraphStyle: { spaceAbove: { magnitude: 0, unit: "PT" }, spaceBelow: { magnitude: 0, unit: "PT" }, lineSpacing: 100 },
            fields: "spaceAbove,spaceBelow,lineSpacing",
          },
        },
      ] }),
    },
  );
}

export async function wasDocumentEditedBy(documentId: string, editorEmail: string) {
  if (!documentId || !editorEmail) return false;
  const token = await accessToken();
  const result = await google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}/revisions?fields=revisions(lastModifyingUser(emailAddress))`, token);
  return (result.revisions || []).some((revision: any) => String(revision?.lastModifyingUser?.emailAddress || "").toLowerCase() === editorEmail.toLowerCase());
}

const fieldLabels: Record<string, string> = {
  relationship_status: "目前關係狀態", relationship_duration: "這段關係多久了？",
  main_event: "這次最想解決的事件？", relationship_goal: "你最希望達成的目標？",
  purpose: "這次是要擇什麼日子呢？", situation: "請說明您目前的狀況",
  date_range: "是否有指定的日期範圍？有沒有特別忌諱或需要注意的？",
  location: "地點在哪裡？", notes: "其他想補充的說明或狀況？",
  preferred_characters: "是否有特別想用的字或喜歡的讀音？",
  name_style: "對名字的風格有沒有什麼想像？", name_taboo: "是否有禁忌或避諱的字或諧音？",
  naming_notes: "其他備註", baby_surname: "希望寶寶姓氏",
  interference_situation: "請簡述被干擾的情況", interference_duration: "這樣的情況多久了？",
  love_status: "目前感情狀態", social_lifestyle: "目前的社交與生活型態",
  home_purpose: "本次諮詢的主要目的", home_problem: "目前住起來最困擾的問題",
  lawsuit_type: "官司／糾紛類型", lawsuit_progress: "目前訴訟進度",
  next_court_date: "下次開庭或調解日期", dispute_summary: "事件簡述與爭議點",
  professional_help: "目前是否有專業人士或他人協助", core_question: "本次最想解答的核心問題",
  current_condition: "目前的心理或生活狀況", previous_handling: "過去是否曾處理過",
  health_concerns: "當前關注的健康問題", major_treatment_planned: "近期是否有手術或重大治療規劃？",
  treatment_question: "想瞭解的問題", treatment_question_other: "其他想瞭解的問題",
  health_notes: "備註", current_regret: "目前的困擾或遺憾", consultation_goal: "這次諮詢最希望獲得什麼",
};

const shichenName = (value: unknown) => text(value).split(/[（(]/)[0];
const virtualAge = (profile: any) => {
  const lunar = text(profile?.lunar_birth_text);
  const rocYear = Number(lunar.match(/民國\s*(\d+)/)?.[1]);
  const birthYear = rocYear ? rocYear + 1911 : Number(text(profile?.birth_date).match(/^(\d{4})/)?.[1]);
  if (!birthYear) return null;
  return Math.max(1, new Date().getFullYear() - birthYear + 1);
};

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
  const age = virtualAge(profile);
  const nameLine = `姓名：${profileName}${profile.gender ? `／${text(profile.gender)}` : ""}${relation ? `（${relation}）` : ""}${age ? `　虛歲：${age}歲` : ""}`;
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

type Mark = { start: number; end: number; kind: "meta" | "title" | "section" | "question" | "answer" | "teacher" | "fieldLabel" | "fieldAnswer" };
type DocumentImage = { marker: string; dataUrl: string; width: number };
type PageSpec = { detail: any; target?: any; targetIndex?: number; targetCount?: number };
const cleanSubItemTitle = (value: unknown) => text(value).replace(/^\s*[＋+]\s*加購\s*[：:]?\s*(?:你)?/, "");
const taipeiClock = (value: Date) => {
  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(value);
  const period = (parts.find((entry) => entry.type === "dayPeriod")?.value || "").replace("凌晨", "上午");
  const hour = (parts.find((entry) => entry.type === "hour")?.value || "0").padStart(2, "0");
  const minute = (parts.find((entry) => entry.type === "minute")?.value || "00").padStart(2, "0");
  return `${period}${hour}:${minute}`;
};
const videoConsultationMinutes = (amount: number) => {
  if (amount <= 5700) return 30;
  if (amount <= 7900) return 35;
  return 40 + Math.floor((amount - 7900) / 1200) * 5;
};
const detailInfo = (detail: any) => {
  const answer = one(detail.booking_consultation_answers);
  const itemCode = one(detail.booking_items)?.code || "";
  const title = text(detail.item_title);
  const subItems = (detail.booking_detail_sub_items || []).map((entry: any) => cleanSubItemTitle(entry.sub_item_title)).filter(Boolean);
  const subTitle = subItems.join("、");
  const personalLove = subTitle.includes("個人感情運") || title.includes("個人感情運");
  const relation = itemCode === "past-life-relationship" || title.includes("與他人前世關係");
  const marriage = (itemCode === "marriage-bazi" || title.includes("感情運勢") || title.includes("合婚") || title.includes("合八字") || title.includes("關係合盤")) && !personalLove;
  return { answer, itemCode, title, subItems, subTitle, relation, marriage };
};

function expandPages(details: any[]): PageSpec[] {
  return details.filter((detail: any) => !!one(detail.booking_consultation_answers)).flatMap((detail: any) => {
    const info = detailInfo(detail);
    const primaryId = text(one(info.answer?.consultation_profiles)?.id || info.answer?.profile_id);
    const participants = (info.answer?.booking_answer_participants || []).slice()
      .sort((a: any, b: any) => a.position - b.position)
      .filter((entry: any) => text(one(entry.consultation_profiles)?.id) !== primaryId);
    if ((info.relation || info.marriage) && participants.length) {
      return participants.map((target: any, targetIndex: number) => ({ detail, target, targetIndex, targetCount: participants.length }));
    }
    return [{ detail }];
  });
}

function documentBody(pageSpec: PageSpec, itemIndex: number, totalItems: number, ownerName: string) {
  const { detail, target, targetIndex, targetCount } = pageSpec;
  let content = "";
  const marks: Mark[] = [];
  const images: DocumentImage[] = [];
  const add = (line: string, kind?: Mark["kind"]) => {
    const start = content.length + 1;
    content += `${line}\n`;
    if (kind) marks.push({ start, end: start + line.length, kind });
  };
  add(`項目 ${itemIndex}（共 ${totalItems} 個項目）`, "meta");
  const info = detailInfo(detail);
  const { answer, itemCode, title, subItems, subTitle, relation, marriage } = info;
  const infantSpirit = itemCode === "infant-spirit" || title.includes("嬰靈");
  const infantMultiple = subTitle.includes("兩位嬰靈") || subTitle.includes("二位嬰靈") || subTitle.includes("含)以上") || subTitle.includes("含）以上");
  const renderedSubTitle = infantSpirit
    ? (infantMultiple ? "兩位嬰靈(含)以上" : "一位嬰靈")
    : subItems.join("、");
  add([text(detail.item_title), renderedSubTitle].filter(Boolean).join("｜"), "title");
  add("");
  const participants = (answer?.booking_answer_participants || []).slice().sort((a: any, b: any) => a.position - b.position);
  const selectedParticipants = target ? [target] : participants;
  const people = [one(answer?.consultation_profiles), ...selectedParticipants.map((entry: any) => one(entry.consultation_profiles))]
    .filter(Boolean).filter((profile: any, index: number, all: any[]) => all.findIndex((entry) => entry.id === profile.id) === index);
  people.forEach((profile: any) => {
    profileLines(profile, ownerName).forEach((line) => add(line));
    if (infantSpirit) {
      const losses = Array.isArray(answer?.extra_data?.pregnancy_losses)
        ? answer.extra_data.pregnancy_losses
        : (Array.isArray(profile.pregnancy_losses) ? profile.pregnancy_losses : []);
      const lossLines = losses.filter((loss: any) => text(loss?.lunar || loss?.lunar_birth_text)).map((loss: any, index: number) => {
        const lunarDate = text(loss.lunar || loss.lunar_birth_text);
        const shichen = text(loss.shichen) ? `（${shichenName(loss.shichen)}）` : "";
        const accuracy = text(loss.accuracy).includes("約") ? "大約日期" : "準確日期";
        const note = text(loss.notes) ? `　備註：${text(loss.notes)}` : "";
        return `${losses.length > 1 ? `${index + 1}.` : ""}${lunarDate}${shichen}${accuracy}${note}`;
      });
      if (lossLines.length) add(`農曆流產日期：${lossLines.join("\n")}`);
    }
    const photoData = text(profile.photo_data);
    if (profile.profile_type === "pet" && photoData.startsWith("data:image/")) {
      const marker = `[[[PET_IMAGE_${text(profile.id) || itemIndex}]]]`;
      add(marker);
      images.push({ marker, dataUrl: photoData, width: 220 });
    }
    add("");
  });
  const extra = answer?.extra_data || {};
  const targetProfile = one(target?.consultation_profiles);
  const targetId = text(targetProfile?.id);
  const questions = targetId && Array.isArray(extra.target_questions?.[targetId])
    ? extra.target_questions[targetId]
    : (answer?.questions || []);
  const addField = (label: string, value: unknown) => {
    const rendered = Array.isArray(value) ? value.map(text).filter(Boolean).join("、") : text(value);
    if (!rendered) return;
    add(label, "fieldLabel"); add(rendered, "fieldAnswer"); add("");
  };
  if (marriage && targetId) {
    const row = extra.relationship_details?.[targetId] || {};
    ["relationship_status", "relationship_duration", "main_event", "relationship_goal"].forEach((key) => addField(fieldLabels[key], row[key]));
  } else if (itemCode === "date-time-selection" || title.includes("擇日")) {
    addField(fieldLabels.purpose, [extra.purpose === "其他" ? extra.other_purpose : extra.purpose, extra.situation].map(text).filter(Boolean).join("，"));
    addField(fieldLabels.location, extra.location);
    addField(fieldLabels.date_range, extra.date_range);
    addField(fieldLabels.notes, extra.notes);
  } else {
    Object.keys(fieldLabels).forEach((key) => {
      if (["relationship_status", "relationship_duration", "main_event", "relationship_goal", "purpose", "situation", "date_range", "location", "notes"].includes(key)) return;
      addField(fieldLabels[key], extra[key]);
    });
    if (Array.isArray(extra.overall_focuses)) addField("目前最關心的事件", extra.overall_focuses);
    const focusDetails = extra.overall_focus_details || {};
    Object.entries(focusDetails).forEach(([focus, rows]) => {
      if (!rows || typeof rows !== "object") return;
      Object.entries(rows as Record<string, unknown>).forEach(([label, value]) => addField(`${focus}－${label}`, value));
    });
  }
  questions.map(text).filter(Boolean).forEach((question: string, index: number) => {
    add(`Q${index + 1}:${question}`, "question");
    add(`A${index + 1}:`, "answer");
    add("");
  });
  add("");
  const isPastLifePersonal = itemCode === "past-life-personal" || text(detail.item_title).includes("前世因果（個人）");
  const isPastLifeRelation = relation;
  const isOverallFortune = itemCode === "overall-fortune" || text(detail.item_title).includes("整體運勢");
  if (isOverallFortune) {
    add("【整體建議】", "section");
    for (let index = 0; index < 5; index += 1) add("\u00a0", "teacher");
    add("【流年運勢】", "section");
    const startingAge = virtualAge(people[0]);
    if (startingAge) {
      for (let age = startingAge; age <= Math.min(99, startingAge + 20); age += 1) add(`${age}歲：\u00a0`, "teacher");
    }
    add("");
    add("備註：");
    add("1.以上均為虛歲");
    add("2.如果沒有特別提到的年紀，代表身體狀況大致平順，不需要特別擔心，只要維持日常保養即可。");
    add("3.運勢中的歲數，僅代表在那個年齡段需要特別留意的事項（非今生會活到幾歲喔） 若遇到劫難的時候就要比較小心，通過自己的努力衝過難關，多做福德佈施，化解災劫也能夠延續生命。");
  }
  if (marriage) {
    const primaryProfile = one(answer?.consultation_profiles);
    const primaryFullName = text(primaryProfile?.name) || ownerName;
    const primaryDisplayName = /^[\u3400-\u9fff]{2,4}$/.test(primaryFullName) ? primaryFullName.slice(1) : primaryFullName;
    const targetName = text(targetProfile?.name) || "對方";
    add("【感情運勢與關係合盤】", "section");
    add("");
    add(`${primaryDisplayName}本身個性`, "teacher");
    add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher");
    add("");
    add("紅鸞星會落在　歲、　歲、　歲、（容易會遇到有緣份的對象，或者是感情會有明顯進展。）", "teacher");
    add("而離婚或離異的高風險年齡則要特別注意：　歲。", "teacher");
    add("");
    add("（以上歲數皆為虛歲）", "teacher");
    add("");
    add(`對方（${targetName}）的個性`, "teacher");
    add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher");
    add("");
    add("對方的紅鸞星會落在　歲、　歲。", "teacher");
    add("而離婚或離異的高風險年齡則要特別注意：　歲。", "teacher");
    add("");
    add("如果要姻緣比較順利，", "teacher");
    add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher");
  }
  const sections = isPastLifeRelation ? ["【前前世】", "【前世】", "【綜觀今生】"] : !isPastLifePersonal ? [] : /前三世|三世/.test(subTitle)
    ? ["【前前前世】", "【前前世】", "【前世】", "【綜觀今生】"]
    : /前兩世|二世/.test(subTitle)
      ? ["【前前世】", "【前世】", "【綜觀今生】"]
      : ["【前世】", "【綜觀今生】"];
  sections.forEach((heading) => {
    add(heading, "section");
    if (isPastLifeRelation && heading === sections[0] && targetProfile?.name) add(`${text(targetProfile.name)}是`, "teacher");
    add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher"); add("\u00a0", "teacher");
  });
  if (itemCode === "date-time-selection" || title.includes("擇日")) {
    add("【擇日建議】", "section");
    const count = /六|6/.test(subTitle) ? 6 : 3;
    for (let index = 1; index <= count; index += 1) add(`${index}.\u00a0`, "teacher");
  }
  const alreadyHasTeacherLayout = isPastLifePersonal || isPastLifeRelation || isOverallFortune || marriage || itemCode === "date-time-selection" || title.includes("擇日");
  if (!alreadyHasTeacherLayout) {
    add(infantSpirit ? "【嬰靈】" : `【${subTitle || title}】`, "section");
    for (let index = 0; index < 4; index += 1) add("\u00a0", "teacher");
  }
  return { content, marks, images };
}

function consultationNumber(position: number) {
  const safe = Math.max(1, position);
  const letterIndex = Math.floor((safe - 1) / 99);
  if (letterIndex > 25) throw new Error("諮詢單編號已超過 Z99，請新增編號規則");
  return `${String.fromCharCode(65 + letterIndex)}${String(((safe - 1) % 99) + 1).padStart(2, "0")}`;
}

export async function createConsultationDocuments(db: any, bookingId: string, bookingNo: string, force = false, createMode: "replace" | "new" = "replace") {
  const { data: booking } = await db.from("bookings").select("created_at,paid_at,slot_start,total_price,consultation_methods(code),customers(line_display_name,full_name)").eq("id", bookingId).single();
  const customer = one(booking?.customers) || {};
  const lineName = text(customer.line_display_name) || "LINE用戶";
  const ownerName = text(customer.full_name) || lineName;
  const isVideo = one(booking?.consultation_methods)?.code === "video" && Boolean(booking?.slot_start);
  const { data: details, error } = await db.from("booking_details").select(`
    id,item_title,created_at,google_document_id,google_document_created_at,
    booking_items(code),booking_detail_sub_items(sub_item_title),
    booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(*),booking_answer_participants(position,consultation_profiles(*)))
  `).eq("booking_id", bookingId).order("created_at", { ascending: true });
  if (error) throw error;
  const allDetails = details || [];
  if (!allDetails.length) return;
  if (!folderId) throw new Error("尚未設定 GOOGLE_DRIVE_OUTPUT_FOLDER_ID");
  if (!appsScriptUrl) throw new Error("尚未設定 GOOGLE_APPS_SCRIPT_WEB_APP_URL");
  if (!appsScriptSecret) throw new Error("尚未設定 GOOGLE_APPS_SCRIPT_SECRET");

  const existingDetails = allDetails.filter((detail: any) => detail.google_document_id);
  if (existingDetails.length && !force) return;
  const anchor = existingDetails[0] || allDetails[0];
  const detailIds = new Set(allDetails.map((detail: any) => detail.id));
  let content = "";
  const marks: Mark[] = [];
  const images: DocumentImage[] = [];
  const pages = expandPages(allDetails);
  if (isVideo) {
    const videoDate = new Date(booking.slot_start);
    const dateParts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(videoDate);
    const part = (type: string) => dateParts.find((entry) => entry.type === type)?.value || "";
    const week = part("weekday").replace("週", "").replace("星期", "");
    const time = taipeiClock(videoDate);
    const amount = Number(booking.total_price || 0);
    const minutes = videoConsultationMinutes(amount);
    const header = `${part("year")}/${part("month")}/${part("day")}(${week})${time}\nLINE名稱：${lineName}｜視訊時間：${minutes}分鐘\n`;
    content += header;
    marks.push({ start: 0, end: header.length - 1, kind: "title" });
  }
  pages.forEach((pageSpec: PageSpec, index: number) => {
    if (index > 0) content += "[[[PAGE_BREAK]]]\n";
    const offset = content.length;
    const page = documentBody(pageSpec, index + 1, pages.length, ownerName);
    // 保留 NBSP 組成的老師輸入區；尤其「【綜觀今生】」通常位於頁尾，
    // 若把 NBSP 一併裁掉，Google 文件就不會留下藍色 12pt 的輸入空間。
    content += page.content.replace(/(?:[ \t]*\n)+$/u, "\n");
    marks.push(...page.marks.map((mark) => ({ ...mark, start: mark.start + offset, end: mark.end + offset })));
    images.push(...page.images);
  });

  const { data: numberedBookings, error: numberError } = await db.from("bookings")
    .select("id,created_at,consultation_methods(code),booking_details(id,google_document_id,google_document_created_at)")
    .order("created_at", { ascending: true });
  if (numberError) throw numberError;
  const uniqueDocuments = (numberedBookings || []).filter((row: any) => one(row.consultation_methods)?.code !== "video")
    .flatMap((row: any) => (row.booking_details || []).filter((detail: any) => detail.google_document_id).map((detail: any) => ({...detail,created:detail.google_document_created_at||row.created_at})))
    .filter((row: any, index: number, rows: any[]) => rows.findIndex((candidate: any) => candidate.google_document_id === row.google_document_id) === index)
    .sort((a: any,b: any)=>String(a.created).localeCompare(String(b.created)));
  const existingPosition = uniqueDocuments.findIndex((row: any) => detailIds.has(row.id));
  const documentPosition = existingPosition >= 0 ? existingPosition + 1 : uniqueDocuments.length + 1;
  const numberDate=new Date(booking?.paid_at||booking?.created_at||Date.now());
  const numberMonth=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",month:"short"}).format(numberDate);
  const numberYear=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Taipei",year:"2-digit"}).format(numberDate);
  let fileTitle = `${consultationNumber(documentPosition)}.${numberMonth}${numberYear}-${lineName}-${ownerName}`;
  if (isVideo) {
    const date = new Date(booking.slot_start);
    const parts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short" }).formatToParts(date);
    const get = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
    const week = get("weekday").replace("週", "").replace("星期", "");
    const time = taipeiClock(date);
    fileTitle = `${get("month")}/${get("day")}(${week})${time} ${lineName}．${ownerName}`;
  }
  const response = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      secret: appsScriptSecret, expectedVersion: requiredAppsScriptVersion, folderId,
      title: fileTitle, bookingNo, content, marks, images, createMode,
      previousDocumentIds: force ? existingDetails.map((detail: any) => detail.google_document_id).filter(Boolean) : [],
    }),
    redirect: "follow",
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Apps Script 建立文件失敗");
  if (result.version !== requiredAppsScriptVersion) throw new Error(`目前連到舊版 Google Apps Script（目前：${result.version || "無版本資訊"}；需要：${requiredAppsScriptVersion}），請更新 Vercel 的 GOOGLE_APPS_SCRIPT_WEB_APP_URL 後重新部署`);
  // 必須先確認頁首頁尾與樣式都處理成功，才把新文件連結寫回資料庫。
  // 這樣發生 Google API 錯誤時，後台會顯示真正原因，不會誤報建立成功。
  await normalizeDocumentHeaderAndFooter(result.documentId, bookingNo);
  const createdAt = existingDetails.map((detail: any) => detail.google_document_created_at).filter(Boolean).sort()[0] || new Date().toISOString();
  const { error: updateError } = await db.from("booking_details").update({
    google_document_id: result.documentId,
    google_document_url: result.documentUrl || `https://docs.google.com/document/d/${result.documentId}/edit`,
    google_document_created_at: createdAt,
  }).eq("id", anchor.id);
  if (updateError) throw updateError;
  const { error: clearError } = await db.from("booking_details").update({
    google_document_id: null, google_document_url: null, google_document_created_at: null,
  }).eq("booking_id", bookingId).neq("id", anchor.id);
  if (clearError) throw clearError;
}
