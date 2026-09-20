import crypto from "node:crypto";
import { makeQuickReplyToken } from "@/lib/quick-reply-token";

const folderId = "1pihxwGH-FJtWPiCAwBcSvs65L603HVu-";
const returnedFolderId = process.env.GOOGLE_DRIVE_RETURNED_FOLDER_ID || "1HMRq4GScXbSsqSwT4ssSDQHKktS29R8K";
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const appsScriptSetting = (process.env.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
const appsScriptUrl = appsScriptSetting && !/^https?:\/\//i.test(appsScriptSetting)
  ? `https://script.google.com/macros/s/${appsScriptSetting.replace(/^\/+|\/+$/g, "")}/exec`
  : appsScriptSetting;
const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";
const requiredAppsScriptVersion = "2026-09-19-v32";
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const text = (value: unknown) => String(value ?? "").trim();
const one = (value: any) => Array.isArray(value) ? value[0] : value;
const resultMatchesConsultationItem = (content: unknown, itemCode: string) => {
  const value = text(content);
  if (itemCode === "deceased-relative") return !/【\s*過世寵物\s*】/u.test(value);
  if (itemCode === "deceased-pet") return !/【\s*過世親人\s*】/u.test(value);
  return true;
};

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

export type ExternalConsultationDocument = {
  id: string;
  name: string;
  modifiedTime: string;
  webViewLink: string;
};

export async function listExternalConsultationDocuments(): Promise<ExternalConsultationDocument[]> {
  const token = await accessToken();
  const query = `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`;
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: "100",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  const result = await google(`https://www.googleapis.com/drive/v3/files?${params}`, token);
  return (Array.isArray(result.files) ? result.files : []).map((file: any) => ({
    id: String(file.id || ""),
    name: String(file.name || "未命名諮詢單"),
    modifiedTime: String(file.modifiedTime || ""),
    webViewLink: String(file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`),
  }));
}

async function assertExternalConsultationDocument(documentId: string) {
  if (!documentId) throw new Error("缺少 Google 文件 ID");
  const token = await accessToken();
  const file = await google(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?fields=id,mimeType,parents,trashed&supportsAllDrives=true`,
    token,
  );
  if (file.trashed || file.mimeType !== "application/vnd.google-apps.document" || !Array.isArray(file.parents) || !file.parents.includes(folderId))
    throw new Error("這份文件不在外部諮詢單資料夾內");
}

export async function getExternalConsultationReply(documentId: string) {
  await assertExternalConsultationDocument(documentId);
  return getQuickConsultationReplyFromDocument(documentId);
}

export async function writeExternalConsultationReply(documentId: string, answer: string) {
  await assertExternalConsultationDocument(documentId);
  await upsertQuickConsultationReply(documentId, answer);
}

function collectSegmentIds(sourceDocument: any, kind: "Header" | "Footer") {
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
}

async function formatDocumentAfterCreation(documentId: string, token: string) {
  let document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const requests: any[] = [{
    updateDocumentStyle: {
      documentStyle: {
        marginHeader: { magnitude: 14.1732, unit: "PT" },
        marginFooter: { magnitude: 14.1732, unit: "PT" },
        useCustomHeaderFooterMargins: true,
      },
      fields: "marginHeader,marginFooter,useCustomHeaderFooterMargins",
    },
  }, {
    updateSectionStyle: {
      range: {
        startIndex: 1,
        endIndex: Math.max(2, Number(document.body?.content?.at(-1)?.endIndex || 2) - 1),
      },
      sectionStyle: {
        marginHeader: { magnitude: 14.1732, unit: "PT" },
        marginFooter: { magnitude: 14.1732, unit: "PT" },
      },
      fields: "marginHeader,marginFooter",
    },
  }];

  // Apps Script 建立完整內文後，才做最後的固定格式覆蓋。
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

  const videoHeader = flatBody.match(/\d{4}\/\d{1,2}\/\d{1,2}\([一二三四五六日]\)(?:上午|中午|下午)\d{2}:\d{2}\nLINE名稱：[^\n]+｜視訊時間：\d+分鐘/);
  if (videoHeader) {
    const videoHeaderOffset = flatBody.indexOf(videoHeader[0]);
    requests.push({
      updateTextStyle: {
        range: { startIndex: locateBodyOffset(videoHeaderOffset), endIndex: locateBodyOffset(videoHeaderOffset + videoHeader[0].length) },
        textStyle: {
          foregroundColor: { color: { rgbColor: { red: 0.651, green: 0.169, blue: 0.345 } } },
          fontSize: { magnitude: 20, unit: "PT" },
          bold: true,
        },
        fields: "foregroundColor,fontSize,bold",
      },
    });
    const finalCharacterOffset = videoHeaderOffset + videoHeader[0].length - 1;
    requests.push({
      updateTextStyle: {
        range: {
          startIndex: locateBodyOffset(finalCharacterOffset),
          endIndex: locateBodyOffset(finalCharacterOffset + 1),
        },
        textStyle: {
          foregroundColor: { color: { rgbColor: { red: 0.651, green: 0.169, blue: 0.345 } } },
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

  if (requests.length) {
    await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  // 頁首頁尾由 Apps Script 建立；Docs API 不再修改頁首，避免建立／重建頁首失敗阻斷最後的空白頁清理。
}

// 既有文件在寫入諮詢回答後也重新套用標題格式，避免 Google 文件延續舊格式，
// 尤其確保「30分鐘」最後的「鐘」仍為玫紅色、粗體、20 PT。
export async function refreshConsultationDocumentFormatting(documentId: string) {
  const token = await accessToken();
  await formatDocumentAfterCreation(documentId, token);
}

function lastVisibleBodyIndex(document: any) {
  let lastVisibleEnd = 1;
  for (const block of document.body?.content || []) {
    // 表格、圖片等即使沒有 textRun 也視為真正內容。
    if (block.table || block.tableOfContents) {
      lastVisibleEnd = Math.max(lastVisibleEnd, Number(block.endIndex || lastVisibleEnd));
      continue;
    }
    const paragraph = block.paragraph;
    if (!paragraph) continue;
    for (const element of paragraph.elements || []) {
      if (element.inlineObjectElement || element.horizontalRule) {
        lastVisibleEnd = Math.max(lastVisibleEnd, Number(element.endIndex || block.endIndex || lastVisibleEnd));
        continue;
      }
      const run = element.textRun;
      if (!run?.content || !Number.isFinite(element.startIndex)) continue;
      const content = String(run.content);
      for (let offset = content.length - 1; offset >= 0; offset -= 1) {
        // NBSP 也視為空白。只保留最後一個真正可見字元。
        if (!/[\s\u00a0]/u.test(content[offset])) {
          lastVisibleEnd = Math.max(lastVisibleEnd, Number(element.startIndex) + offset + 1);
          break;
        }
      }
    }
  }
  return lastVisibleEnd;
}

async function cleanupFinalBlankPage(documentId: string, token: string) {
  // 只在整份文件與所有格式都完成後執行。Google Docs API 沒有「刪除第 N 頁」API，
  // 因此這裡只處理「最後一個可見字元之後」的空白結構，不碰任何實際內容。
  for (let pass = 0; pass < 6; pass += 1) {
    let document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
    const body = document.body?.content || [];
    const documentEnd = body.reduce((max: number, block: any) => Math.max(max, Number(block.endIndex || 0)), 1);
    const lastVisibleEnd = lastVisibleBodyIndex(document);
    const tail = body.slice(-10).map((block: any) => ({
      startIndex: block.startIndex,
      endIndex: block.endIndex,
      type: block.paragraph ? "paragraph" : block.table ? "table" : block.sectionBreak ? "sectionBreak" : "other",
      text: block.paragraph ? (block.paragraph.elements || []).map((element: any) => {
        if (element.pageBreak) return "[PAGE_BREAK]";
        return String(element.textRun?.content || "").replace(/\u00a0/g, "[NBSP]").replace(/\n/g, "[NL]");
      }).join("").slice(0, 180) : "",
      pageBreakBefore: Boolean(block.paragraph?.paragraphStyle?.pageBreakBefore),
      keepWithNext: Boolean(block.paragraph?.paragraphStyle?.keepWithNext),
      keepLinesTogether: Boolean(block.paragraph?.paragraphStyle?.keepLinesTogether),
      spaceBelow: block.paragraph?.paragraphStyle?.spaceBelow,
      lineSpacing: block.paragraph?.paragraphStyle?.lineSpacing,
    }));
    console.info("[consultation-doc] final blank-page cleanup", { documentId, pass, documentEnd, lastVisibleEnd, tail });

    // A. 先刪掉最後可見內容之後的 NBSP、空白換行與 page break。
    // 文件最後的 terminal newline 必須保留，所以只刪到 documentEnd - 1。
    const deleteEnd = documentEnd - 1;
    if (deleteEnd > lastVisibleEnd) {
      try {
        await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
          method: "POST",
          body: JSON.stringify({ requests: [{ deleteContentRange: { range: { startIndex: lastVisibleEnd, endIndex: deleteEnd } } }] }),
        });
        continue; // index 已改變，重新 documents.get 再判斷。
      } catch (error) {
        console.warn("[consultation-doc] trailing blank delete rejected; collapsing blank paragraphs instead", {
          documentId, pass, lastVisibleEnd, deleteEnd, error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // B. 如果跨 section/table 邊界不能直接刪，就只壓縮「最後可見字元之後」的純空白 paragraph。
    // 這能處理 NBSP 預留區、pageBreakBefore、keepWithNext 等把 terminal paragraph 推到下一頁的情況。
    const collapseRequests: any[] = [];
    for (const block of body) {
      if (!block.paragraph || block.startIndex == null || block.endIndex == null) continue;
      if (Number(block.endIndex) <= lastVisibleEnd) continue;
      const startIndex = Math.max(lastVisibleEnd, Number(block.startIndex));
      const endIndex = Math.min(Number(block.endIndex), documentEnd - 1);
      if (endIndex > startIndex) {
        collapseRequests.push({
          updateTextStyle: {
            range: { startIndex, endIndex },
            textStyle: { fontSize: { magnitude: 1, unit: "PT" } },
            fields: "fontSize",
          },
        });
      }
      const paragraphEnd = Math.max(Number(block.startIndex) + 1, Number(block.endIndex) - 1);
      if (paragraphEnd > Number(block.startIndex)) {
        collapseRequests.push({
          updateParagraphStyle: {
            range: { startIndex: Number(block.startIndex), endIndex: paragraphEnd },
            paragraphStyle: {
              pageBreakBefore: false,
              keepWithNext: false,
              keepLinesTogether: false,
              spaceAbove: { magnitude: 0, unit: "PT" },
              spaceBelow: { magnitude: 0, unit: "PT" },
              lineSpacing: 100,
            },
            fields: "pageBreakBefore,keepWithNext,keepLinesTogether,spaceAbove,spaceBelow,lineSpacing",
          },
        });
      }
    }

    // C. 同時把最後一個真正有內容的 paragraph 的「段後距／強制換頁」歸零。
    // 只調段落排版，不刪任何可見文字；可避免最後 terminal newline 被推到獨立空白頁。
    const lastContentParagraph = [...body].reverse().find((block: any) => {
      if (!block.paragraph || block.startIndex == null || block.endIndex == null) return false;
      return Number(block.startIndex) < lastVisibleEnd && Number(block.endIndex) >= lastVisibleEnd;
    });
    if (lastContentParagraph) {
      const paragraphStart = Number(lastContentParagraph.startIndex);
      const paragraphEnd = Math.max(paragraphStart + 1, Number(lastContentParagraph.endIndex) - 1);
      if (paragraphEnd > paragraphStart) {
        collapseRequests.push({
          updateParagraphStyle: {
            range: { startIndex: paragraphStart, endIndex: paragraphEnd },
            paragraphStyle: {
              pageBreakBefore: false,
              keepWithNext: false,
              keepLinesTogether: false,
              spaceBelow: { magnitude: 0, unit: "PT" },
            },
            fields: "pageBreakBefore,keepWithNext,keepLinesTogether,spaceBelow",
          },
        });
      }
    }

    if (collapseRequests.length) {
      await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({ requests: collapseRequests }),
      });
    }

    // D. 再抓一次最新文件。若已沒有可刪的尾端內容，就結束；否則下一 pass 再試一次 delete。
    document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
    const refreshedBody = document.body?.content || [];
    const refreshedEnd = refreshedBody.reduce((max: number, block: any) => Math.max(max, Number(block.endIndex || 0)), 1);
    const refreshedVisibleEnd = lastVisibleBodyIndex(document);
    if (refreshedEnd - 1 <= refreshedVisibleEnd) break;
  }

  const verified = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const plain = documentPlainText(verified);
  if (!plain.replace(/[\s\u00a0]/g, "")) throw new Error("空白頁清理後文件內容異常，已停止後續流程");
}

async function normalizeDocumentHeaderAndFooter(documentId: string, bookingNo: string, requestOrigin = "") {
  const token = await accessToken();

  // 文字格式、空白頁與回傳圖片按鈕分開執行，避免任一步驟互相拖累。
  await formatDocumentAfterCreation(documentId, token);
  await cleanupFinalBlankPage(documentId, token);
  if (requestOrigin) {
    try {
      await insertQuickReplyLink(documentId, bookingNo, requestOrigin, token);
    } catch (error) {
      console.error("[consultation-doc] 建立諮詢回覆連結失敗", {
        documentId, bookingNo, error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function insertQuickReplyLink(documentId: string, bookingNo: string, requestOrigin: string, token: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) throw new Error("建立諮詢回覆連結需要 HTTPS 網址");
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const quickLabel = "✦ 阿嫂點此快速回覆";
  const divider = "｜";
  const returnLabel = "✦回傳諮詢結果";
  const existingText = indexedDocumentText(document);
  const existingOffset = existingText.plain.indexOf(quickLabel);
  const replyToken=makeQuickReplyToken(bookingNo,documentId);
  const linkUrl = `${origin}/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}&token=${encodeURIComponent(replyToken)}`;
  const returnUrl = `${origin}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`;
  const inserted = `${quickLabel}${divider}${returnLabel}\n`;
  const textStart = existingOffset >= 0 ? existingText.documentIndexAt(existingOffset) : 1;
  const dividerStart = textStart + quickLabel.length;
  const returnStart = textStart + quickLabel.length + divider.length;
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [
      ...(existingOffset >= 0 ? [] : [{ insertText: { location: { index: 1 }, text: inserted } }]),
      { updateTextStyle: { range: { startIndex: textStart, endIndex: textStart + quickLabel.length }, textStyle: {
        bold: true,
        fontSize: { magnitude: 15, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
        backgroundColor: { color: { rgbColor: { red: 0.541, green: 0.188, blue: 0.271 } } },
        link: { url: linkUrl },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor,link" } },
      { updateTextStyle: { range: { startIndex: dividerStart, endIndex: returnStart }, textStyle: {
        bold: false,
        fontSize: { magnitude: 15, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
        backgroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor" } },
      { updateTextStyle: { range: { startIndex: returnStart, endIndex: returnStart + returnLabel.length }, textStyle: {
        bold: true,
        fontSize: { magnitude: 15, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
        backgroundColor: { color: { rgbColor: { red: 0.184, green: 0.502, blue: 0.329 } } },
        link: { url: returnUrl },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor,link" } },
      { updateParagraphStyle: { range: { startIndex: textStart, endIndex: textStart + inserted.length }, paragraphStyle: {
        alignment: "CENTER",
        spaceAbove: { magnitude: 4, unit: "PT" },
        spaceBelow: { magnitude: 8, unit: "PT" },
      }, fields: "alignment,spaceAbove,spaceBelow" } },
    ] }),
  });
}

async function insertQuickReplyLinkViaAppsScript(documentId: string, bookingNo: string, requestOrigin: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) throw new Error("建立諮詢回覆連結需要 HTTPS 網址");
  const replyToken = makeQuickReplyToken(bookingNo, documentId);
  const linkUrl = `${origin}/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}&token=${encodeURIComponent(replyToken)}`;
  const response = await fetch(appsScriptUrl, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify({
      secret: appsScriptSecret,
      expectedVersion: requiredAppsScriptVersion,
      action: "upsertQuickReplyLink",
      documentId,
      label: "✦ 點這裡建立諮詢回覆",
      linkUrl,
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "快速建立回覆連結補寫失敗");
  if (result.version !== requiredAppsScriptVersion) throw new Error(`Google Apps Script 版本不一致（目前：${result.version || "未知"}；需要：${requiredAppsScriptVersion}）`);
}

async function insertConsultationReturnButton(documentId: string, bookingNo: string, requestOrigin: string, token: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) throw new Error("Google 文件圖片按鈕需要可公開讀取的 HTTPS 網址");
  const imageUrl = `${origin}/consultation-return-button.png`;
  const returnUrl = `${origin}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`;
  void token;
  await updatePositionedReturnButton({ documentId, imageUrl, returnUrl });
}

async function updatePositionedReturnButton(args: { documentId: string; imageUrl: string; returnUrl: string; returnedAt?: string }) {
  if (!appsScriptUrl || !appsScriptSecret) throw new Error("尚未設定 Google Apps Script");
  const response = await fetch(appsScriptUrl, {
    method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, redirect: "follow",
    body: JSON.stringify({ secret: appsScriptSecret, expectedVersion: requiredAppsScriptVersion, action: "upsertReturnButton", ...args }),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Google 文件定位圖片更新失敗");
  if (result.version !== requiredAppsScriptVersion) throw new Error(`Google Apps Script 版本不一致（目前：${result.version || "未知"}；需要：${requiredAppsScriptVersion}）`);
}

function returnedTimeLabel(value: string) {
  const formatted = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
  return `上次回傳時間：${formatted}`;
}

export async function markConsultationResultReturned(documentId: string, requestOrigin: string, returnedAt: string, bookingNo: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  const returnUrl = `${origin}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`;
  const token = await accessToken();
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const { plain, documentIndexAt } = indexedDocumentText(document);
  const pendingLabel = "✦回傳諮詢結果";
  const completedLabel = "✦已回傳諮詢結果";
  const sourceStart = plain.includes(pendingLabel) ? plain.indexOf(pendingLabel) : plain.indexOf(completedLabel);
  if (sourceStart < 0) return;
  const lineEnd = plain.indexOf("\n", sourceStart);
  const sourceEnd = lineEnd < 0 ? sourceStart + (plain.includes(pendingLabel) ? pendingLabel.length : completedLabel.length) : lineEnd;
  const timeText = returnedTimeLabel(returnedAt).replace(/^上次回傳時間：/, "");
  const replacement = `${completedLabel} ${timeText}`;
  const startIndex = documentIndexAt(sourceStart);
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [
      { deleteContentRange: { range: { startIndex, endIndex: documentIndexAt(sourceEnd) } } },
      { insertText: { location: { index: startIndex }, text: replacement } },
      { updateTextStyle: { range: { startIndex, endIndex: startIndex + completedLabel.length }, textStyle: {
        bold: true, fontSize: { magnitude: 15, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
        backgroundColor: { color: { rgbColor: { red: 0.184, green: 0.502, blue: 0.329 } } },
        link: { url: returnUrl },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor,link" } },
      { updateTextStyle: { range: { startIndex: startIndex + completedLabel.length + 1, endIndex: startIndex + replacement.length }, textStyle: {
        bold: false, fontSize: { magnitude: 11, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 0.45, green: 0.45, blue: 0.45 } } },
        backgroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor" } },
    ] }),
  });
}

export async function moveConsultationDocumentToReturnedFolder(documentId: string) {
  if (!documentId || !returnedFolderId) return;
  const token = await accessToken();
  const file = await google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?fields=parents&supportsAllDrives=true`, token);
  const previousParents = Array.isArray(file.parents) ? file.parents.filter((id: unknown) => String(id) !== returnedFolderId) : [];
  const params = new URLSearchParams({ addParents: returnedFolderId, supportsAllDrives: "true", fields: "id,parents" });
  if (previousParents.length) params.set("removeParents", previousParents.join(","));
  await google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}?${params}`, token, { method: "PATCH" });
}

export async function refreshConsultationReturnButton(documentId: string, requestOrigin: string, bookingNo: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  await updatePositionedReturnButton({ documentId, imageUrl: `${origin}/consultation-return-button.png?v=20260908-3`, returnUrl: `${origin}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}` });
}

export async function markConsultationOrderCancelled(documentId: string) {
  if (!documentId) return;
  const token = await accessToken();
  const warning = "此筆訂單已取消，請確認。";
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  if (documentPlainText(document).includes(warning)) return;
  const anchorBlock = (document.body?.content || []).find((block: any) =>
    (block.paragraph?.elements || []).some((element: any) => String(element.textRun?.content || "").includes("\u200B")),
  );
  const warningIndex = anchorBlock ? Number(anchorBlock.endIndex || 1) : 1;
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [
      { insertText: { location: { index: warningIndex }, text: `${warning}\n` } },
      { updateTextStyle: { range: { startIndex: warningIndex, endIndex: warningIndex + warning.length }, textStyle: {
        bold: true,
        fontSize: { magnitude: 17.25, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 1, green: 0.9804, blue: 0.4157 } } },
        backgroundColor: { color: { rgbColor: { red: 0.8, green: 0, blue: 0 } } },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor" } },
      { updateParagraphStyle: { range: { startIndex: warningIndex, endIndex: warningIndex + warning.length + 1 }, paragraphStyle: {
        spaceAbove: { magnitude: 0, unit: "PT" }, spaceBelow: { magnitude: 4, unit: "PT" },
      }, fields: "spaceAbove,spaceBelow" } },
    ] }),
  });
}

export async function wasDocumentEditedBy(documentId: string, editorEmail: string) {
  if (!documentId || !editorEmail) return false;
  const token = await accessToken();
  const result = await google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(documentId)}/revisions?fields=revisions(lastModifyingUser(emailAddress))`, token);
  return (result.revisions || []).some((revision: any) => String(revision?.lastModifyingUser?.emailAddress || "").toLowerCase() === editorEmail.toLowerCase());
}

export type ConsultationReturnItem = { index: number; itemTitle: string; content: string };

export function normalizeConsultationReturnText(value: string) {
  return String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
    .trim();
}

function documentPlainText(document: any) {
  let output = "";
  for (const block of document.body?.content || []) {
    if (block.paragraph) {
      for (const element of block.paragraph.elements || []) {
        if (element.textRun?.content) output += String(element.textRun.content);
        else if (element.pageBreak) output += "\n";
      }
    }
  }
  return output.replace(/[\u00a0\u200b]/g, " ").replace(/\r/g, "");
}

export async function getConsultationReturnPreview(documentId: string): Promise<ConsultationReturnItem[]> {
  if (!documentId) throw new Error("缺少 Google 文件 ID");
  const token = await accessToken();
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const body = documentPlainText(document);
  const marker = /項目\s*(\d+)\s*[（(]共\s*\d+\s*個項目[）)]/g;
  const matches = Array.from(body.matchAll(marker));
  if (!matches.length) throw new Error("這份諮詢單找不到『項目 N』區段，請重新建立諮詢單後再試");
  return matches.map((match, idx) => {
    const segmentStart = match.index || 0;
    const segmentEnd = idx + 1 < matches.length ? (matches[idx + 1].index || body.length) : body.length;
    let segment = normalizeConsultationReturnText(body.slice(segmentStart, segmentEnd));
    const afterMarker = segment.slice(match[0].length).replace(/^\s+/, "");
    const firstLine = afterMarker.split("\n").map((line) => line.trim()).find(Boolean) || `項目 ${idx + 1}`;
    const lines = segment.split("\n"), manualRows: { question: string; answer: string }[] = [];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const manual = /^阿嫂回覆\s*[:：]\s*(.+)$/u.exec(lines[lineIndex].trim());
      if (!manual) continue;
      const previous = lines.slice(0, lineIndex).map((line, index) => ({ line: line.trim(), index })).filter((entry) => entry.line);
      const valueRow = previous.at(-1), labelRow = previous.at(-2);
      const fallbackQuestion = firstLine.replace(/^【|】$/g, "");
      const question = labelRow && !/^(姓名|農曆生日|居住地址|訂單編號)\s*[:：]/u.test(labelRow.line)
        ? labelRow.line.replace(/[：:]$/u, "")
        : fallbackQuestion;
      manualRows.push({ question, answer: manual[1].trim() });
      lines[lineIndex] = "";
    }
    if (manualRows.length) {
      const maxQuestion = Math.max(0, ...Array.from(segment.matchAll(/(?:^|\n)Q(\d+)\s*[:：]/g)).map((entry) => Number(entry[1])));
      const appended = manualRows.map((row, rowIndex) => `Q${maxQuestion + rowIndex + 1}:${row.question}\nA${maxQuestion + rowIndex + 1}:${row.answer}`).join("\n\n");
      segment = lines.join("\n");
      const tagOffset = segment.search(/【[^】\n]+】/u);
      segment = tagOffset >= 0
        ? `${segment.slice(0, tagOffset).replace(/\s+$/u, "")}\n\n${appended}\n\n${segment.slice(tagOffset)}`
        : `${segment.replace(/\s+$/u, "")}\n\n${appended}`;
    }
    let startOffset = -1;
    if (idx === 0) startOffset = segment.indexOf("您好，以下是您的諮詢結果");
    if (startOffset < 0) {
      const q1 = /(?:^|\n)Q1\s*[:：]/m.exec(segment);
      if (q1) startOffset = (q1.index || 0) + (q1[0].startsWith("\n") ? 1 : 0);
    }
    if (startOffset < 0) {
      const tag = /【[^】\n]+】/.exec(segment);
      if (tag) startOffset = tag.index || 0;
    }
    if (startOffset < 0) throw new Error(`項目 ${idx + 1} 找不到 Q1 或結果標籤，請確認文件格式`);
    const content = normalizeConsultationReturnText(segment.slice(startOffset));
    return { index: idx + 1, itemTitle: firstLine, content };
  });
}

export type QuickReplyManualReply = {
  answer:string; label:string; question:string; itemCode:string; itemLabel:string; targetName:string; profileName:string;
};

export async function upsertQuickConsultationManualReplies(documentId:string,entries:QuickReplyManualReply[]) {
  const values=entries.map(entry=>({...entry,answer:normalizeConsultationReturnText(entry.answer)})).filter(entry=>entry.answer);
  if(!documentId||!values.length)return;
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain,documentIndexAt}=indexedDocumentText(document);
  const pageStarts=Array.from(plain.matchAll(/(?:^|\n)項目\s*\d+[^\n]*/g)).map(match=>(match.index||0)+(match[0].startsWith("\n")?1:0));
  const pages=pageStarts.map((start,index)=>({start,end:pageStarts[index+1]??plain.length,text:plain.slice(start,pageStarts[index+1]??plain.length)}));
  const writes:any[]=[];
  for(const entry of values){
    const page=pages.find(candidate=>entry.targetName&&candidate.text.includes(entry.targetName)&&candidate.text.includes(entry.itemLabel))
      || pages.find(candidate=>entry.profileName&&candidate.text.includes(entry.profileName)&&candidate.text.includes(entry.itemLabel))
      || pages.find(candidate=>candidate.text.includes(entry.itemLabel))
      || pages.find(candidate=>entry.targetName&&candidate.text.includes(entry.targetName));
    if(!page)throw new Error(`找不到「${entry.itemLabel||entry.label}」的諮詢單頁面`);
    let insertOffset=-1;
    // 畫面欄位名稱與 Google 文件中的題目偶爾不同；用戶實際填寫的文字
    // 才是最穩定的定位點，因此優先寫在該內容的正下方。
    if(entry.question){
      const labelOffset=entry.label?page.text.indexOf(entry.label):-1;
      const valueOffset=page.text.indexOf(entry.question,Math.max(0,labelOffset));
      if(valueOffset>=0){
        const valueNewline=page.text.indexOf("\n",valueOffset+entry.question.length);
        insertOffset=page.start+(valueNewline>=0?valueNewline+1:valueOffset+entry.question.length);
      }
    }
    if(entry.label&&entry.label!=="本項目"){
      const labelOffset=insertOffset<0?page.text.indexOf(entry.label):-1;
      if(labelOffset>=0){
        const firstNewline=page.text.indexOf("\n",labelOffset),secondNewline=firstNewline>=0?page.text.indexOf("\n",firstNewline+1):-1;
        insertOffset=page.start+(secondNewline>=0?secondNewline+1:firstNewline>=0?firstNewline+1:labelOffset+entry.label.length);
      }
    }
    if(insertOffset<0){
      const headingOffset=page.text.search(/【[^】\n]+】/u);
      insertOffset=headingOffset>=0?page.start+headingOffset:page.end;
    }
    const following=plain.slice(insertOffset,page.end),existing=/^阿嫂回覆\s*[:：][^\n]*/u.exec(following);
    const inserted=`阿嫂回覆：${entry.answer}\n`;
    writes.push({startOffset:insertOffset,endOffset:existing?insertOffset+existing[0].length:insertOffset,text:inserted});
  }
  writes.sort((a,b)=>b.startOffset-a.startOffset);
  const requests:any[]=[];
  for(const write of writes){
    const startIndex=documentIndexAt(write.startOffset),endIndex=documentIndexAt(write.endOffset);
    if(endIndex>startIndex)requests.push({deleteContentRange:{range:{startIndex,endIndex}}});
    requests.push({insertText:{location:{index:startIndex},text:write.text}});
    requests.push({updateTextStyle:{range:{startIndex,endIndex:startIndex+write.text.trimEnd().length},textStyle:{bold:false,fontSize:{magnitude:12,unit:"PT"},foregroundColor:{color:{rgbColor:{red:.102,green:.349,blue:.8}}}},fields:"bold,fontSize,foregroundColor"}});
  }
  if(requests.length)await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,token,{method:"POST",body:JSON.stringify({requests})});
}

const QUICK_REPLY_HEADING = "【阿嫂回答】";

function indexedDocumentText(document: any) {
  const chunks: { text: string; start: number; end: number }[] = [];
  for (const block of document.body?.content || []) {
    for (const element of block.paragraph?.elements || []) {
      const value = String(element.textRun?.content || "");
      if (value) chunks.push({ text: value, start: Number(element.startIndex || 1), end: Number(element.endIndex || 1) });
    }
  }
  const plain = chunks.map((entry) => entry.text).join("");
  const documentIndexAt = (offset: number) => {
    let consumed = 0;
    for (const entry of chunks) {
      if (offset <= consumed + entry.text.length) return entry.start + Math.max(0, offset - consumed);
      consumed += entry.text.length;
    }
    return Math.max(1, Number(document.body?.content?.at(-1)?.endIndex || 2) - 1);
  };
  return { plain, documentIndexAt, bodyEnd: Math.max(1, Number(document.body?.content?.at(-1)?.endIndex || 2) - 1) };
}

export async function getQuickConsultationReplyFromDocument(documentId: string) {
  if (!documentId) return "";
  const token = await accessToken();
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const { plain } = indexedDocumentText(document);
  const marker = plain.lastIndexOf(QUICK_REPLY_HEADING);
  return marker < 0 ? "" : normalizeConsultationReturnText(plain.slice(marker + QUICK_REPLY_HEADING.length));
}

export async function upsertQuickConsultationReply(documentId: string, answer: string) {
  const normalized = normalizeConsultationReturnText(answer);
  if (!documentId) throw new Error("缺少 Google 文件 ID");
  if (!normalized) throw new Error("請先輸入阿嫂回答");
  const token = await accessToken();
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const { plain, documentIndexAt, bodyEnd } = indexedDocumentText(document);
  const markerOffset = plain.lastIndexOf(QUICK_REPLY_HEADING);
  const replacing = markerOffset >= 0;
  const insertIndex = replacing ? documentIndexAt(markerOffset) : bodyEnd;
  const prefix = replacing || !plain.trim() ? "" : "\n\n";
  const inserted = `${prefix}${QUICK_REPLY_HEADING}\n${normalized}\n`;
  const headingStart = insertIndex + prefix.length;
  const answerStart = headingStart + QUICK_REPLY_HEADING.length + 1;
  const requests: any[] = [];
  if (replacing && insertIndex < bodyEnd) requests.push({ deleteContentRange: { range: { startIndex: insertIndex, endIndex: bodyEnd } } });
  requests.push({ insertText: { location: { index: insertIndex }, text: inserted } });
  requests.push({ updateTextStyle: { range: { startIndex: headingStart, endIndex: headingStart + QUICK_REPLY_HEADING.length }, textStyle: {
    bold: true, fontSize: { magnitude: 15, unit: "PT" }, foregroundColor: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } },
  }, fields: "bold,fontSize,foregroundColor" } });
  requests.push({ updateTextStyle: { range: { startIndex: answerStart, endIndex: answerStart + normalized.length }, textStyle: {
    bold: false, fontSize: { magnitude: 12, unit: "PT" }, foregroundColor: { color: { rgbColor: { red: 0.102, green: 0.349, blue: 0.8 } } },
  }, fields: "bold,fontSize,foregroundColor" } });
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST", body: JSON.stringify({ requests }),
  });
}

export type QuickReplyQuestionSlot = { slotIndex:number; questionNumber:number; question:string; answer:string };
export type QuickReplySectionSlot = { slotIndex:number; label:string; answer:string };

export async function getQuickReplyQuestionSlots(documentId:string):Promise<QuickReplyQuestionSlot[]> {
  if(!documentId)throw new Error("缺少 Google 文件 ID");
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain}=indexedDocumentText(document),questionPattern=/(?:^|\n)Q(\d+)\s*[:：]\s*([^\n]*)\nA\1\s*[:：]\s*([^\n]*)/g;
  return Array.from(plain.matchAll(questionPattern)).map((match,slotIndex)=>({slotIndex,questionNumber:Number(match[1]),question:normalizeConsultationReturnText(match[2]),answer:normalizeConsultationReturnText(match[3])}));
}

export async function getQuickReplySectionSlots(documentId:string):Promise<QuickReplySectionSlot[]> {
  if(!documentId)throw new Error("缺少 Google 文件 ID");
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain}=indexedDocumentText(document),headingPattern=/(?:^|\n)【([^】\n]+)】[^\n]*\n/g,answerArea=plain.indexOf("您好，以下是您的諮詢結果"),baseOffset=answerArea>=0?answerArea:0,scopedPlain=plain.slice(baseOffset);
  const matches=Array.from(scopedPlain.matchAll(headingPattern));
  return matches.map((match,slotIndex)=>{
    const start=baseOffset+(match.index||0)+match[0].length;
    const rest=plain.slice(start),boundary=rest.search(/\n(?=(?:【[^】\n]+】|項目\s*\d+|Q\d+\s*[:：]|備註：|您好，以下是您的諮詢結果))/);
    const raw=boundary>=0?rest.slice(0,boundary):rest;
    return {slotIndex,label:normalizeConsultationReturnText(match[1]),answer:normalizeConsultationReturnText(raw.replace(/[\u00a0\u200b]/g," "))};
  });
}

export async function upsertQuickConsultationQuestionReplies(documentId:string,answers:Record<string,string>) {
  if(!documentId)throw new Error("缺少 Google 文件 ID");
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain,documentIndexAt}=indexedDocumentText(document);
  const answerPattern=/(?:^|\n)A(\d+)\s*[:：]([^\n]*)/g;
  const slots=Array.from(plain.matchAll(answerPattern)).map((match,slotIndex)=>{
    const whole=match[0],leading=whole.startsWith("\n")?1:0,colonOffset=whole.search(/[:：]/),value=normalizeConsultationReturnText(String(answers[String(slotIndex)]||""));
    const lineOffset=(match.index||0)+leading,startOffset=(match.index||0)+colonOffset+1,endOffset=(match.index||0)+whole.length;
    const beforeAnswer=plain.slice(0,lineOffset),staleMatch=/(?:^|\n)(阿嫂回覆\s*[:：][^\n]*)\n(?:[ \t\u00a0]*\n)*$/u.exec(beforeAnswer);
    const staleTextOffset=staleMatch?beforeAnswer.lastIndexOf(staleMatch[1]): -1;
    const staleManual=staleTextOffset>=0?{startIndex:documentIndexAt(staleTextOffset),endIndex:documentIndexAt(staleTextOffset+staleMatch![1].length)}:null;
    return {slotIndex,value,startIndex:documentIndexAt(startOffset),endIndex:documentIndexAt(endOffset),lineStart:documentIndexAt(lineOffset),staleManual};
  }).filter(slot=>slot.value).sort((a,b)=>b.startIndex-a.startIndex);
  if(!slots.length)throw new Error("找不到可寫入的 A1、A2 回答位置");
  const requests:any[]=[];
  for(const slot of slots){
    if(slot.endIndex>slot.startIndex)requests.push({deleteContentRange:{range:{startIndex:slot.startIndex,endIndex:slot.endIndex}}});
    requests.push({insertText:{location:{index:slot.startIndex},text:slot.value}});
    requests.push({updateTextStyle:{range:{startIndex:slot.startIndex,endIndex:slot.startIndex+slot.value.length},textStyle:{bold:false,fontSize:{magnitude:12,unit:"PT"},foregroundColor:{color:{rgbColor:{red:.102,green:.349,blue:.8}}}},fields:"bold,fontSize,foregroundColor"}});
    // 舊版曾把已有 Qn 的回答誤寫成「阿嫂回覆：」。先完成 An 更新，
    // 再刪除前一行的舊文字，避免舊、新答案同時留在文件中。
    if(slot.staleManual&&slot.staleManual.endIndex>slot.staleManual.startIndex)requests.push({deleteContentRange:{range:slot.staleManual}});
  }
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,token,{method:"POST",body:JSON.stringify({requests})});
}

export async function upsertQuickConsultationSectionReplies(documentId:string,answers:Record<string,string>) {
  if(!documentId)throw new Error("缺少 Google 文件 ID");
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain,documentIndexAt}=indexedDocumentText(document),headingPattern=/(?:^|\n)【([^】\n]+)】[^\n]*\n/g,answerArea=plain.indexOf("您好，以下是您的諮詢結果"),baseOffset=answerArea>=0?answerArea:0,scopedPlain=plain.slice(baseOffset);
  const matches=Array.from(scopedPlain.matchAll(headingPattern));
  const slots=matches.map((match,slotIndex)=>{
    const startOffset=baseOffset+(match.index||0)+match[0].length,rest=plain.slice(startOffset),boundary=rest.search(/\n(?=(?:【[^】\n]+】|項目\s*\d+|Q\d+\s*[:：]|備註：|您好，以下是您的諮詢結果))/),endOffset=boundary>=0?startOffset+boundary:Math.max(startOffset,plain.replace(/\n$/,"").length);
    return {slotIndex,value:normalizeConsultationReturnText(String(answers[String(slotIndex)]||"")),startIndex:documentIndexAt(startOffset),endIndex:documentIndexAt(endOffset)};
  }).filter(slot=>slot.value).sort((a,b)=>b.startIndex-a.startIndex);
  if(!slots.length)return;
  const requests:any[]=[];
  for(const slot of slots){
    if(slot.endIndex>slot.startIndex)requests.push({deleteContentRange:{range:{startIndex:slot.startIndex,endIndex:slot.endIndex}}});
    const inserted=`${slot.value}\n`;
    requests.push({insertText:{location:{index:slot.startIndex},text:inserted}});
    requests.push({updateTextStyle:{range:{startIndex:slot.startIndex,endIndex:slot.startIndex+slot.value.length},textStyle:{bold:false,fontSize:{magnitude:12,unit:"PT"},foregroundColor:{color:{rgbColor:{red:.102,green:.349,blue:.8}}}},fields:"bold,fontSize,foregroundColor"}});
  }
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,token,{method:"POST",body:JSON.stringify({requests})});
}

export async function upsertPastLifeOverviewReplies(documentId:string,answers:{answer:string;itemCode:string;targetName:string;profileName:string}[]) {
  const values=answers.map(entry=>{
    const normalized=normalizeConsultationReturnText(entry.answer).replace(/\u2060/g,"");
    const extract=(heading:string)=>{
      const markers=[`【${heading}】`,`＊${heading}`,`*${heading}`],marker=markers.find(value=>normalized.includes(value))||"",markerIndex=marker?normalized.indexOf(marker):-1;
      if(markerIndex<0)return heading==="綜觀今生"?normalized:"";
      const contentStart=markerIndex+marker.length;
      const remaining=normalized.slice(contentStart).replace(/^\s*\n?/,"");
      const nextHeading=remaining.search(/\n(?:【[^】]+】|[＊*][^\n]+)/);
      return (nextHeading>=0?remaining.slice(0,nextHeading):remaining).trim();
    };
    const overview=extract("綜觀今生"),advice=extract("兩人相處建議");
    return {...entry,overview:overview.replace(/\n{2,}/g,"\n").trim(),advice:advice.replace(/\n{2,}/g,"\n").trim()};
  });
  if(!documentId||!values.some(value=>value.overview||value.advice))return;
  const token=await accessToken();
  const document=await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,token);
  const {plain,documentIndexAt}=indexedDocumentText(document);
  const pageStarts=Array.from(plain.matchAll(/(?:^|\n)項目\s*\d+[^\n]*/g)).map(match=>(match.index||0)+(match[0].startsWith("\n")?1:0));
  const pages=pageStarts.map((start,index)=>({start,end:pageStarts[index+1]??plain.length,text:plain.slice(start,pageStarts[index+1]??plain.length)}));
  const slots:any[]=[];
  for(const [entryIndex,entry] of values.entries()){
    if(!entry.overview&&!entry.advice)continue;
    const page=pages.find(candidate=>entry.itemCode==="past-life-relationship"
      ? candidate.text.includes("前世因果（與他人前世關係）")&&candidate.text.includes(entry.targetName)
      : candidate.text.includes("前世因果（個人）")) || pages[entryIndex];
    if(!page)continue;
    for(const [heading,key] of [["綜觀今生","overview"],["兩人相處建議","advice"]] as const){
      const value=entry[key];
      if(!value)continue;
      const marker=`【${heading}】`,headingOffset=page.text.indexOf(marker);
      if(headingOffset<0)continue;
      const afterHeading=page.start+headingOffset+marker.length;
      const newlineOffset=plain.indexOf("\n",afterHeading);
      const startOffset=newlineOffset>=0&&newlineOffset<page.end?newlineOffset+1:afterHeading;
      const rest=plain.slice(startOffset,page.end),boundary=rest.search(/\n\s*(?=(?:【[^】\n]+】|項目\s*\d+|Q\d+\s*[:：]|備註：|您好，以下是您的諮詢結果))/),rawExisting=boundary>=0?rest.slice(0,boundary):rest;
      // 保留 Google Docs 每個段落／區段最後的換行字元。空白教師輸入區不必刪除，
      // 直接在其前方插入；有舊內容時也只刪到最後一個可見字元。
      const removableExisting=rawExisting.replace(/[\s\u00a0\u200b]+$/u,"");
      const endOffset=startOffset+removableExisting.length;
      slots.push({value,key,targetName:entry.targetName,startIndex:documentIndexAt(startOffset),endIndex:documentIndexAt(endOffset),shouldDelete:removableExisting.replace(/[\s\u00a0\u200b]/gu,"").length>0});
    }
  }
  const missingOverview=values.find(entry=>entry.overview&&!slots.some(slot=>slot.key==="overview"&&slot.targetName===entry.targetName));
  if(missingOverview)throw new Error(`找不到${missingOverview.targetName||"個人項目"}頁面的【綜觀今生】寫入位置`);
  slots.sort((a,b)=>b.startIndex-a.startIndex);
  const requests:any[]=[];
  for(const slot of slots){
    if(slot.shouldDelete&&slot.endIndex>slot.startIndex)requests.push({deleteContentRange:{range:{startIndex:slot.startIndex,endIndex:slot.endIndex}}});
    requests.push({insertText:{location:{index:slot.startIndex},text:`${slot.value}\n`}});
    requests.push({updateTextStyle:{range:{startIndex:slot.startIndex,endIndex:slot.startIndex+slot.value.length},textStyle:{bold:false,fontSize:{magnitude:12,unit:"PT"},foregroundColor:{color:{rgbColor:{red:.102,green:.349,blue:.8}}}},fields:"bold,fontSize,foregroundColor"}});
  }
  if(requests.length)await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,token,{method:"POST",body:JSON.stringify({requests})});
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
  old_name: "公司目前名字（或舊名）", business: "主要業務與產品", mode: "公司經營模式",
  partner: "其他合夥人", preferences: "命名喜好與禁忌", favorite_words: "特別喜歡或想放進去的字",
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

const companyPartnerSummary = (profile: any) => {
  if (!profile) return "";
  const name = text(profile.name || profile.full_name);
  const lunar = text(profile.lunar_birth_text);
  const shichen = text(profile.birth_shichen) ? `（${shichenName(profile.birth_shichen)}）` : "";
  const zodiac = text(profile.zodiac) ? `生肖：${text(profile.zodiac)}` : "";
  const birth = `${lunar}${shichen}${zodiac}`;
  const address = text(profile.address || profile.full_address);
  // 公司合夥人固定顯示：姓名／農曆生日（時辰）生肖／地址。
  return [name, birth, address].filter(Boolean).join("／");
};

type Mark = { start: number; end: number; kind: "meta" | "title" | "section" | "question" | "answer" | "teacher" | "deceasedTeacher" | "fieldLabel" | "fieldAnswer" | "previousResultTitle" | "previousResult" };
type DocumentImage = { marker: string; dataUrl: string; width: number };
type PageSpec = { detail: any; target?: any; targetIndex?: number; targetCount?: number; previousResult?: string; previousCreatedAt?: string; previousMethod?: string; previousVideoSlotStart?: string };
const compactPreviousResult = (value: unknown) => text(value)
  .replace(/^您好，以下是您的諮詢結果\s*/u, "")
  .replace(/^【(?:過世親人|個人感情運)】\s*$/gmu, "")
  .replace(/\n[ \t]*\n+/g, "\n")
  .trim();
const previousResultDate = (value: unknown) => {
  const date = new Date(text(value));
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(date);
  const get = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  return `${get("year")}/${get("month")}/${get("day")}`;
};
const consultationMethodLabel = (value: unknown) => text(value) === "video" ? "視訊諮詢" : text(value) === "text" ? "文字諮詢" : text(value);
const previousVideoTime = (value: unknown) => {
  const date = new Date(text(value));
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(date);
  const get = (type: string) => parts.find((entry) => entry.type === type)?.value || "";
  const week = get("weekday").replace("週", "").replace("星期", "");
  const period = get("dayPeriod").replace("凌晨", "上午");
  return `${get("month")}/${get("day")}(${week})${period}${get("hour")}:${get("minute")}`;
};
const cleanSubItemTitle = (value: unknown) => text(value)
  .replace(/^\s*[＋+]\s*加購\s*[：:]?\s*(?:你)?/, "")
  .replace(/個人感情運\s*[（(]\s*僅看自己\s*[）)]/gu, "個人感情運");
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
  const questions = targetId
    ? (Array.isArray(extra.target_questions?.[targetId]) ? extra.target_questions[targetId] : [])
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
    const isCompany = subTitle.includes("公司命名") || subTitle.includes("公司改名") || title.includes("公司命名") || title.includes("公司改名");
    if (isCompany) {
      const allPeople = [one(answer?.consultation_profiles), ...(answer?.booking_answer_participants || []).map((entry:any) => one(entry.consultation_profiles))].filter(Boolean);
      const partnerProfile = allPeople.find((profile:any) => text(profile.id) === text(extra.partner)) || answer?.__profileLookup?.[text(extra.partner)];
      // 依諮詢單格式顯示「姓名／農曆生日（時辰）生肖／地址」，不可把 profile UUID 印出來。
      const partnerName = companyPartnerSummary(partnerProfile) || text(extra.partner);
      addField(fieldLabels.old_name, extra.old_name);
      addField(fieldLabels.business, extra.business);
      addField(fieldLabels.mode, extra.mode === "sole" ? "獨資（自己一人開）" : extra.mode === "partners" ? "合夥（有其他股東）" : extra.mode);
      if (extra.mode === "partners") addField(fieldLabels.partner, partnerName);
      addField(fieldLabels.preferences, extra.preferences);
      addField(fieldLabels.favorite_words, extra.favorite_words);
      addField("其他備註", extra.notes);
    }
    Object.keys(fieldLabels).forEach((key) => {
      if (["relationship_status", "relationship_duration", "main_event", "relationship_goal", "purpose", "situation", "date_range", "location", "notes", "old_name", "business", "mode", "partner", "preferences", "favorite_words"].includes(key)) return;
      addField(fieldLabels[key], extra[key]);
    });
    const focusDetails = extra.overall_focus_details || {};
    const conciseFocusLabels: Record<string, Record<string, string>> = {
      想換工作: {
        "目前公司／產業": "公司或產業", "目前職位與主要工作內容": "職位或工作",
        "希望轉往的方向／職務": "希望轉往", "想離開或換工作的主要原因": "離開原因",
      },
      職涯迷惘: {
        "目前正在考慮的選擇": "考慮中的選擇", "目前的工作／待業狀態": "工作或待業狀態",
        "選擇工作時最在意的條件": "最在意的條件", "目前最大的困難": "目前困難",
      },
      財務壓力: {
        "最希望改善的事情": "想改善", "目前主要的壓力來源": "壓力來源",
        "這個狀況持續多久了": "持續時間", "是否有重要期限": "重要期限",
      },
    };
    const conciseFocusOrder: Record<string, string[]> = {
      想換工作: ["目前公司／產業", "目前職位與主要工作內容", "希望轉往的方向／職務", "想離開或換工作的主要原因"],
      職涯迷惘: ["目前正在考慮的選擇", "目前的工作／待業狀態", "選擇工作時最在意的條件", "目前最大的困難"],
      財務壓力: ["最希望改善的事情", "目前主要的壓力來源", "這個狀況持續多久了", "是否有重要期限"],
    };
    Object.entries(focusDetails).forEach(([focus, rows]) => {
      if (!rows || typeof rows !== "object") return;
      const values = rows as Record<string, unknown>;
      const keys = conciseFocusOrder[focus] || Object.keys(values);
      const lines = keys.map((key) => {
        const value = text(values[key]);
        if (!value) return "";
        const label = conciseFocusLabels[focus]?.[key] || key.replace(/[／/]/g, "或");
        return `${label}：${value}`;
      }).filter(Boolean);
      if (lines.length) {
        add(focus, "fieldLabel");
        lines.forEach((line) => add(line, "fieldAnswer"));
        add("");
      }
    });
  }
  const previousResult = compactPreviousResult(pageSpec.previousResult);
  if (previousResult) {
    const method = consultationMethodLabel(pageSpec.previousMethod);
    const previousMeta = [`${previousResultDate(pageSpec.previousCreatedAt)}建立諮詢單`, method];
    if (pageSpec.previousMethod === "video" && pageSpec.previousVideoSlotStart) previousMeta.push(`視訊時間：${previousVideoTime(pageSpec.previousVideoSlotStart)}`);
    add(`最近一次諮詢結果：${previousMeta.filter(Boolean).join("｜")}`, "previousResultTitle");
    previousResult.split(/\r?\n/).forEach((line) => add(line, "previousResult"));
    add("");
  }
  if (itemIndex === 1) {
    add("您好，以下是您的諮詢結果");
    add("");
  }
  const isOverallFortune = itemCode === "overall-fortune" || text(detail.item_title).includes("整體運勢");
  const overallQuestionLabels: Record<string, string> = {
    想換工作: "想換工作建議",
    職涯迷惘: "職涯迷惘建議",
    財務壓力: "財務壓力建議",
  };
  const selectedOverallFocuses = (Array.isArray(extra.overall_focuses)
    ? extra.overall_focuses.map(text).filter(Boolean)
    : Object.keys(extra.overall_focus_details || {}).filter(Boolean)).slice(0, 3);
  const renderedQuestions = isOverallFortune && selectedOverallFocuses.length
    ? selectedOverallFocuses.map((focus: string) => overallQuestionLabels[focus] || `${focus}建議`)
    : questions.map(text).filter(Boolean);
  renderedQuestions.forEach((question: string, index: number) => {
    add(`Q${index + 1}:${question}`, "question");
    add(`A${index + 1}:`, "answer");
    // A1/A2 本身已經是一行可直接填寫的回答區；只再保留一個空白段落，
    // 避免建立文件時每題固定撐出四行空白，讓手機與電腦版都更緊湊。
    add("\u00a0", "answer");
  });
  add("");
  const isPastLifePersonal = itemCode === "past-life-personal" || text(detail.item_title).includes("前世因果（個人）");
  const isPastLifeRelation = relation;
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
  }
  const sections = isPastLifeRelation ? ["【前前世】", "【前世】", "【綜觀今生】", "【兩人相處建議】"] : !isPastLifePersonal ? [] : /前三世|三世/.test(subTitle)
    ? ["【前前前世】", "【前前世】", "【前世】", "【綜觀今生】"]
    : /前兩世|二世/.test(subTitle)
      ? ["【前前世】", "【前世】", "【綜觀今生】"]
      : ["【前世】", "【綜觀今生】"];
  sections.forEach((heading) => {
    add(heading, "section");
    if (isPastLifeRelation && heading === sections[0] && targetProfile?.name) add(`${text(targetProfile.name)}是`, "teacher");
    // 快速回覆可直接將內容寫入標題下一行，無須預留四個空白段落。
    // 留一行仍方便阿嫂在 Google 文件內手動補充。
    add("\u00a0", "teacher");
  });
  if (itemCode === "date-time-selection" || title.includes("擇日")) {
    add("【擇日建議】", "section");
    const count = /六|6/.test(subTitle) ? 6 : 3;
    for (let index = 1; index <= count; index += 1) add(`${index}.\u00a0`, "teacher");
  }
  const alreadyHasTeacherLayout = isPastLifePersonal || isPastLifeRelation || isOverallFortune || marriage || itemCode === "date-time-selection" || title.includes("擇日");
  if (!alreadyHasTeacherLayout) {
    const teacherKind = itemCode === "deceased-relative" ? "deceasedTeacher" : "teacher";
    add(infantSpirit ? "【嬰靈】" : `【${subTitle || title}】`, "section");
    for (let index = 0; index < 4; index += 1) add(itemCode === "deceased-relative" ? "\u200b" : "\u00a0", teacherKind);
  }
  return { content, marks, images };
}

function consultationNumber(position: number) {
  const safe = Math.max(1, position);
  const letterIndex = Math.floor((safe - 1) / 99);
  if (letterIndex > 25) throw new Error("諮詢單編號已超過 Z99，請新增編號規則");
  return `${String.fromCharCode(65 + letterIndex)}${String(((safe - 1) % 99) + 1).padStart(2, "0")}`;
}

export async function createConsultationDocuments(db: any, bookingId: string, bookingNo: string, force = false, createMode: "replace" | "new" = "replace", submissionId?: string, requestOrigin = "") {
  const { data: booking } = await db.from("bookings").select("customer_id,created_at,paid_at,slot_start,total_price,payment_status,status,cancellation_reason,consultation_methods(code),customers(line_display_name,full_name)").eq("id", bookingId).single();
  const customer = one(booking?.customers) || {};
  const lineName = text(customer.line_display_name) || "LINE用戶";
  const ownerName = text(customer.full_name) || lineName;
  const isVideo = one(booking?.consultation_methods)?.code === "video" && Boolean(booking?.slot_start);
  // 只看訂單目前的最終狀態。曾取消後又改成手動收款時，舊的取消原因可能仍保留，
  // 但不能再把已恢復且已付款的訂單標成取消。
  const isCancelledOrRefunded = booking?.status === "cancelled" || booking?.payment_status === "failed";
  const { data: details, error } = await db.from("booking_details").select(`
    id,item_id,item_title,created_at,google_document_id,google_document_created_at,
    booking_items(code),booking_detail_sub_items(sub_item_title),
    booking_consultation_answers(id,profile_id,questions,extra_data,consultation_profiles(*),booking_answer_participants(position,consultation_profiles(*)))
  `).eq("booking_id", bookingId).order("created_at", { ascending: true });
  if (error) throw error;
  const allDetails = details || [];
  if (submissionId) {
    const { data: submission, error: submissionError } = await db.from("booking_data_submissions").select("payload").eq("id", submissionId).eq("booking_id", bookingId).single();
    if (submissionError || !submission) throw new Error("找不到選擇的填寫版本");
    const snapshotProfiles = new Map((submission.payload?.profiles || []).map((profile: any) => [profile.id, profile]));
    for (const detail of allDetails) {
      detail.booking_consultation_answers = (submission.payload?.answers || []).filter((answer: any) => answer.booking_detail_id === detail.id).map((answer: any) => ({
        ...answer,
        consultation_profiles: snapshotProfiles.get(answer.profile_id),
        booking_answer_participants: (answer.booking_answer_participants || []).map((participant: any) => ({...participant, consultation_profiles: snapshotProfiles.get(participant.profile_id)})),
      }));
    }
  }
  if (!allDetails.length) return;
  const allAnswers = allDetails.flatMap((detail: any) => detail.booking_consultation_answers || []);
  const profileIds = Array.from(new Set(allAnswers.flatMap((answer: any) => [
    answer.profile_id,
    ...(answer.booking_answer_participants || []).map((participant: any) => participant.profile_id),
    // 公司命名／改名的「其他合夥人」可能只存在 extra_data.partner，
    // 沒有被加入 booking_answer_participants；若不一起查會直接把 UUID 印到諮詢單。
    answer?.extra_data?.partner,
  ]).filter(Boolean))) as string[];
  if (profileIds.length) {
    const { data: profiles, error: profileError } = await db.from("consultation_profiles").select("*").in("id", profileIds);
    if (profileError) throw profileError;
    const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
    allAnswers.forEach((answer: any) => {
      if (!one(answer.consultation_profiles) && profilesById.has(answer.profile_id)) answer.consultation_profiles = profilesById.get(answer.profile_id);
      (answer.booking_answer_participants || []).forEach((participant: any) => {
        if (!one(participant.consultation_profiles) && profilesById.has(participant.profile_id)) participant.consultation_profiles = profilesById.get(participant.profile_id);
      });
      answer.__profileLookup = Object.fromEntries(profilesById);
    });
  }
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
  const pages = expandPages(allDetails).filter((pageSpec) => {
    const answer = one(pageSpec.detail.booking_consultation_answers);
    const selected = pageSpec.target ? [pageSpec.target] : (answer?.booking_answer_participants || []);
    const hasProfile = Boolean(one(answer?.consultation_profiles)) || selected.some((participant: any) => Boolean(one(participant.consultation_profiles)));
    const targetProfileId = text(one(pageSpec.target?.consultation_profiles)?.id);
    const hasQuestions = pageSpec.target
      ? (answer?.extra_data?.target_questions?.[targetProfileId] || []).some((question: unknown) => text(question))
      : (answer?.questions || []).some((question: unknown) => text(question));
    const serializedExtra = JSON.stringify(answer?.extra_data || {}).replace(/[\s{}\[\]",:]/g, "");
    return hasProfile || hasQuestions || Boolean(serializedExtra);
  });
  if (pages.length) {
    const currentDetailIds = new Set(allDetails.map((detail: any) => text(detail.id)));
    const currentProfileIds = Array.from(new Set(pages.map((pageSpec) => text(one(pageSpec.detail.booking_consultation_answers)?.profile_id)).filter(Boolean)));
    const currentItemIds = Array.from(new Set(pages.map((pageSpec) => text(pageSpec.detail.item_id)).filter(Boolean)));
    if (currentProfileIds.length && currentItemIds.length) {
      const { data: histories, error: historyError } = await db.from("consultation_result_history")
        .select("booking_detail_id,item_id,profile_id,target_profile_id,result_content,consultation_method,consultation_created_at,video_slot_start,returned_at,booking_details(bookings(status,payment_status))")
        .in("profile_id", currentProfileIds).in("item_id", currentItemIds)
        .order("returned_at", { ascending: false });
      if (historyError && !String(historyError.message || "").includes("consultation_result_history")) throw historyError;
      for (const pageSpec of pages) {
        const answer = one(pageSpec.detail.booking_consultation_answers);
        const targetId = text(one(pageSpec.target?.consultation_profiles)?.id || pageSpec.target?.profile_id) || null;
        const match = (histories || []).find((row: any) =>
          !currentDetailIds.has(text(row.booking_detail_id)) &&
          one(one(row.booking_details)?.bookings)?.status !== "cancelled" &&
          one(one(row.booking_details)?.bookings)?.payment_status !== "failed" &&
          text(row.item_id) === text(pageSpec.detail.item_id) &&
          text(row.profile_id) === text(answer?.profile_id) &&
          (text(row.target_profile_id) || null) === targetId &&
          resultMatchesConsultationItem(row.result_content, one(pageSpec.detail.booking_items)?.code || ""),
        );
        if (match?.result_content) {
          pageSpec.previousResult = match.result_content;
          pageSpec.previousCreatedAt = match.consultation_created_at || match.returned_at;
          pageSpec.previousMethod = match.consultation_method;
          pageSpec.previousVideoSlotStart = match.video_slot_start;
        }
      }
    }
    // 舊訂單在此功能上線前沒有結果歷史資料；從既有 Google 文件回查一次，
    // 讓第一次部署後就能帶入舊客人的最近結果。
    if (pages.some((pageSpec) => !pageSpec.previousResult || !pageSpec.previousCreatedAt || !pageSpec.previousMethod || (pageSpec.previousMethod === "video" && !pageSpec.previousVideoSlotStart)) && booking?.customer_id) {
      const { data: oldBookings, error: oldBookingError } = await db.from("bookings").select(`
        id,slot_start,consultation_result_returned_at,consultation_methods(code),
        booking_details(id,item_id,item_title,created_at,google_document_id,google_document_url,google_document_created_at,
          booking_items(code),booking_detail_sub_items(sub_item_title),
          booking_consultation_answers(profile_id,booking_answer_participants(profile_id,position)))
      `).eq("customer_id", booking.customer_id).neq("id", bookingId)
        .neq("status", "cancelled").neq("payment_status", "failed")
        .not("consultation_result_returned_at", "is", null)
        .order("consultation_result_returned_at", { ascending: false });
      if (oldBookingError) throw oldBookingError;
      const previewCache = new Map<string, ConsultationReturnItem[]>();
      for (const pageSpec of pages.filter((entry) => !entry.previousResult || !entry.previousCreatedAt || !entry.previousMethod || (entry.previousMethod === "video" && !entry.previousVideoSlotStart))) {
        const answer = one(pageSpec.detail.booking_consultation_answers);
        const profileId = text(answer?.profile_id);
        const targetId = text(one(pageSpec.target?.consultation_profiles)?.id || pageSpec.target?.profile_id) || null;
        for (const oldBooking of oldBookings || []) {
          const oldDetails = (oldBooking.booking_details || []).slice().sort((a: any, b: any) => text(a.created_at).localeCompare(text(b.created_at)));
          const oldPages = expandPages(oldDetails);
          const oldPageIndex = oldPages.findIndex((candidate) => {
            const oldAnswer = one(candidate.detail.booking_consultation_answers);
            const oldTargetId = text(one(candidate.target?.consultation_profiles)?.id || candidate.target?.profile_id) || null;
            return text(candidate.detail.item_id) === text(pageSpec.detail.item_id) && text(oldAnswer?.profile_id) === profileId && oldTargetId === targetId;
          });
          if (oldPageIndex < 0) continue;
          const documentDetail = oldDetails.find((detail: any) => detail.google_document_id || detail.google_document_url);
          const documentId = text(documentDetail?.google_document_id) || text(documentDetail?.google_document_url).match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] || "";
          if (!documentId) continue;
          try {
            if (!previewCache.has(documentId)) previewCache.set(documentId, await getConsultationReturnPreview(documentId));
            const previous = previewCache.get(documentId)?.[oldPageIndex];
            if (previous?.content && resultMatchesConsultationItem(previous.content, one(pageSpec.detail.booking_items)?.code || "")) {
              if (!pageSpec.previousResult) pageSpec.previousResult = previous.content;
              pageSpec.previousCreatedAt = documentDetail?.google_document_created_at || documentDetail?.created_at || oldBooking.consultation_result_returned_at;
              pageSpec.previousMethod = one(oldBooking.consultation_methods)?.code;
              pageSpec.previousVideoSlotStart = oldBooking.slot_start;
            }
          } catch (legacyError) {
            console.error("讀取舊 Google 諮詢結果失敗", { documentId, legacyError });
          }
          if (pageSpec.previousResult) break;
        }
      }
    }
  }
  if (!pages.length && !isVideo) throw new Error("這筆訂單沒有可輸出的諮詢者資料或問事內容，未建立空白諮詢單");
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
  if (!content.replace(/\[\[\[PAGE_BREAK\]\]\]/g, "").replace(/[\s\u00a0]/g, ""))
    throw new Error("這筆訂單沒有可輸出的文件內容，未建立空白諮詢單");

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
  let fileTitle = `${consultationNumber(documentPosition)}-${lineName}.${ownerName} ${numberMonth}${numberYear}`;
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
      secret: appsScriptSecret, expectedVersion: requiredAppsScriptVersion, folderId, serviceAccountEmail: email,
      title: fileTitle, bookingNo, content, marks, images, createMode,
      quickReplyUrl: requestOrigin ? `${requestOrigin.replace(/\/$/, "")}/staff/quick-reply?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent("__DOCUMENT_ID__")}` : "",
      quickReplyLabel: "✦ 阿嫂點此快速回覆",
      returnLabel: "✦回傳諮詢結果",
      returnUrl: requestOrigin ? `${requestOrigin.replace(/\/$/, "")}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent("__DOCUMENT_ID__")}` : "",
      cancelledWarning: isCancelledOrRefunded,
      previousDocumentIds: force ? existingDetails.map((detail: any) => detail.google_document_id).filter(Boolean) : [],
    }),
    redirect: "follow",
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || "Apps Script 建立文件失敗");
  if (result.version !== requiredAppsScriptVersion) throw new Error(`目前連到舊版 Google Apps Script（目前：${result.version || "無版本資訊"}；需要：${requiredAppsScriptVersion}），請更新 Vercel 的 GOOGLE_APPS_SCRIPT_WEB_APP_URL 後重新部署`);
  // 新文件的格式、快速回覆與回傳 LINE 已在同一次 Apps Script 建立流程完成。
  // 不再立刻透過服務帳號重新讀取新文件，徹底避開 Google 權限同步期間的
  //「Document is missing」錯誤。
  if (Array.isArray(result.warnings) && result.warnings.length) {
    console.warn("[consultation-doc] 文件已建立，附加整理有非致命警告", {
      documentId: result.documentId,
      bookingNo,
      warnings: result.warnings,
    });
  }
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
  // 檔名重排是附加整理；即使 Drive 權限同步較慢，也不能阻斷按鈕、連結與資料庫寫回。
  if (createMode === "new" && result.documentId && result.documentTitle) {
    const reorderedTitle = String(result.documentTitle).replace(/\s+([A-Z][a-z]{2}\d{2})\.新(\d+)$/u, ".新$2 $1");
    if (reorderedTitle !== result.documentTitle) {
      try {
        const token = await accessToken();
        await google(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(result.documentId)}?supportsAllDrives=true`, token, {
          method: "PATCH",
          body: JSON.stringify({ name: reorderedTitle }),
        });
      } catch (renameError) {
        console.error("[consultation-doc] 新版諮詢單檔名重排失敗，不影響文件功能", { documentId: result.documentId, renameError });
      }
    }
  }
}
