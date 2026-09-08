import crypto from "node:crypto";

const folderId = process.env.GOOGLE_DRIVE_OUTPUT_FOLDER_ID || process.env.GOOGLE_DRIVE_TEMPLATE_FOLDER_ID || "";
const returnedFolderId = process.env.GOOGLE_DRIVE_RETURNED_FOLDER_ID || "18zRTeG1bAmWDCev0LJLslpo5LC7frYhX";
const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const appsScriptSetting = (process.env.GOOGLE_APPS_SCRIPT_WEB_APP_URL || "").trim();
const appsScriptUrl = appsScriptSetting && !/^https?:\/\//i.test(appsScriptSetting)
  ? `https://script.google.com/macros/s/${appsScriptSetting.replace(/^\/+|\/+$/g, "")}/exec`
  : appsScriptSetting;
const appsScriptSecret = process.env.GOOGLE_APPS_SCRIPT_SECRET || "";
const requiredAppsScriptVersion = "2026-09-03-v13";
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

  if (requests.length) {
    await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  // 頁首頁尾由 Apps Script 建立；Docs API 不再修改頁首，避免建立／重建頁首失敗阻斷最後的空白頁清理。
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
      await insertConsultationReturnButton(documentId, bookingNo, requestOrigin, token);
    } catch (error) {
      console.error("[consultation-doc] 回傳諮詢結果圖片按鈕建立失敗", {
        documentId, bookingNo, error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

async function insertConsultationReturnButton(documentId: string, bookingNo: string, requestOrigin: string, token: string) {
  const origin = requestOrigin.replace(/\/$/, "");
  if (!/^https:\/\//i.test(origin)) throw new Error("Google 文件圖片按鈕需要可公開讀取的 HTTPS 網址");
  const insertIndex = 1;
  const imageUrl = `${origin}/consultation-return-button.png`;
  const returnUrl = `${origin}/staff/consultation-return?bookingNo=${encodeURIComponent(bookingNo)}&documentId=${encodeURIComponent(documentId)}`;
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [
      { insertText: { location: { index: insertIndex }, text: "\n" } },
      { insertInlineImage: { uri: imageUrl, location: { index: insertIndex }, objectSize: { width: { magnitude: 170, unit: "PT" } } } },
      { updateTextStyle: { range: { startIndex: insertIndex, endIndex: insertIndex + 1 }, textStyle: { link: { url: returnUrl } }, fields: "link" } },
      { updateParagraphStyle: { range: { startIndex: insertIndex, endIndex: insertIndex + 1 }, paragraphStyle: { alignment: "END", spaceBelow: { magnitude: 0, unit: "PT" } }, fields: "alignment,spaceBelow" } },
    ] }),
  });
  const verified = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const inserted = (verified.body?.content || []).some((block: any) => (block.paragraph?.elements || []).some((element: any) => element.inlineObjectElement && Number(element.startIndex) === insertIndex));
  if (!inserted) throw new Error("Google 文件未回傳已插入的圖片物件");
}

function returnedTimeLabel(value: string) {
  const formatted = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(value));
  return `上次回傳時間：${formatted}`;
}

export async function markConsultationResultReturned(documentId: string, requestOrigin: string, returnedAt: string) {
  const token = await accessToken();
  const origin = requestOrigin.replace(/\/$/, "");
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const buttonElement = (document.body?.content || []).flatMap((block: any) => block.paragraph?.elements || [])
    .find((element: any) => element.inlineObjectElement);
  const objectId = buttonElement?.inlineObjectElement?.inlineObjectId;
  if (!objectId) throw new Error("找不到諮詢單上的回傳按鈕圖片");
  const label = returnedTimeLabel(returnedAt);
  const requests: any[] = [{ replaceImage: { imageObjectId: objectId, uri: `${origin}/consultation-returned-button.png`, imageReplaceMethod: "CENTER_CROP" } }];
  const plain = documentPlainText(document);
  if (plain.includes("上次回傳時間：")) {
    requests.push({ replaceAllText: { containsText: { text: "上次回傳時間：[^\\n]*", matchCase: true, searchByRegex: true }, replaceText: label } });
  } else {
    requests.push({ insertText: { location: { index: Number(buttonElement.endIndex || 2) }, text: `\n${label}` } });
  }
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, { method: "POST", body: JSON.stringify({ requests }) });
  const refreshed = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  for (const block of refreshed.body?.content || []) {
    for (const element of block.paragraph?.elements || []) {
      const content = String(element.textRun?.content || "");
      const offset = content.indexOf(label);
      if (offset < 0) continue;
      const startIndex = Number(element.startIndex) + offset, endIndex = startIndex + label.length;
      await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
        method: "POST", body: JSON.stringify({ requests: [
          { updateTextStyle: { range: { startIndex, endIndex }, textStyle: { foregroundColor: { color: { rgbColor: { red: .48, green: .48, blue: .48 } } }, fontSize: { magnitude: 9, unit: "PT" } }, fields: "foregroundColor,fontSize" } },
          { updateParagraphStyle: { range: { startIndex, endIndex }, paragraphStyle: { alignment: "END", spaceAbove: { magnitude: 2, unit: "PT" }, spaceBelow: { magnitude: 0, unit: "PT" } }, fields: "alignment,spaceAbove,spaceBelow" } },
        ] }),
      });
      return;
    }
  }
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

export async function refreshConsultationReturnButton(documentId: string, requestOrigin: string) {
  const token = await accessToken();
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  const buttonElement = (document.body?.content || []).flatMap((block: any) => block.paragraph?.elements || [])
    .find((element: any) => element.inlineObjectElement);
  const objectId = buttonElement?.inlineObjectElement?.inlineObjectId;
  if (!objectId) return;
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [{ replaceImage: {
      imageObjectId: objectId,
      uri: `${requestOrigin.replace(/\/$/, "")}/consultation-return-button.png?v=20260908-2`,
      imageReplaceMethod: "CENTER_CROP",
    } }] }),
  });
}

export async function markConsultationOrderCancelled(documentId: string) {
  if (!documentId) return;
  const token = await accessToken();
  const warning = "此筆訂單已取消，請確認。";
  const document = await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, token);
  if (documentPlainText(document).includes(warning)) return;
  await google(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [
      { insertText: { location: { index: 1 }, text: `${warning}\n` } },
      { updateTextStyle: { range: { startIndex: 1, endIndex: 1 + warning.length }, textStyle: {
        bold: true,
        fontSize: { magnitude: 17.25, unit: "PT" },
        foregroundColor: { color: { rgbColor: { red: 1, green: 0.9804, blue: 0.4157 } } },
        backgroundColor: { color: { rgbColor: { red: 0.8, green: 0, blue: 0 } } },
      }, fields: "bold,fontSize,foregroundColor,backgroundColor" } },
      { updateParagraphStyle: { range: { startIndex: 1, endIndex: 2 + warning.length }, paragraphStyle: {
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
  return output.replace(/\u00a0/g, " ").replace(/\r/g, "");
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
    const segment = normalizeConsultationReturnText(body.slice(segmentStart, segmentEnd));
    const afterMarker = segment.slice(match[0].length).replace(/^\s+/, "");
    const firstLine = afterMarker.split("\n").map((line) => line.trim()).find(Boolean) || `項目 ${idx + 1}`;
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

type Mark = { start: number; end: number; kind: "meta" | "title" | "section" | "question" | "answer" | "teacher" | "fieldLabel" | "fieldAnswer" };
type DocumentImage = { marker: string; dataUrl: string; width: number };
type PageSpec = { detail: any; target?: any; targetIndex?: number; targetCount?: number };
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
    if (Array.isArray(extra.overall_focuses)) addField("目前最關心的事件", extra.overall_focuses);
    const focusDetails = extra.overall_focus_details || {};
    Object.entries(focusDetails).forEach(([focus, rows]) => {
      if (!rows || typeof rows !== "object") return;
      Object.entries(rows as Record<string, unknown>).forEach(([label, value]) => addField(`${focus}－${label}`, value));
    });
  }
  if (itemIndex === 1) {
    add("您好，以下是您的諮詢結果");
    add("");
  }
  questions.map(text).filter(Boolean).forEach((question: string, index: number) => {
    add(`Q${index + 1}:${question}`, "question");
    add(`A${index + 1}:`, "answer");
    for (let line = 0; line < 4; line += 1) add("\u00a0", "answer");
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

export async function createConsultationDocuments(db: any, bookingId: string, bookingNo: string, force = false, createMode: "replace" | "new" = "replace", submissionId?: string, requestOrigin = "") {
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
  // 二次整理失敗時仍先把已建立的文件連結寫回後台，但不能再「靜默成功」。
  // 寫回完成後會把錯誤拋回 API，讓後台與 Vercel log 都能明確看到真正失敗原因。
  let normalizationError: unknown = null;
  try {
    await normalizeDocumentHeaderAndFooter(result.documentId, bookingNo, requestOrigin);
  } catch (error) {
    normalizationError = error;
    console.error("[consultation-doc] Google 文件最終整理失敗", { documentId: result.documentId, bookingNo, error });
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
  if (normalizationError) {
    throw normalizationError instanceof Error ? normalizationError : new Error("Google 文件最終整理失敗");
  }
}
