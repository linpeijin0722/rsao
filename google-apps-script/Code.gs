const SCRIPT_VERSION = "2026-09-08-v14";
const RETURN_BUTTON_ANCHOR = "\u200B";

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, version: SCRIPT_VERSION }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 林阿嫂預約系統－Google 文件建立端點
 * 部署前請在「專案設定 → 指令碼屬性」新增：
 * WEBHOOK_SECRET = 與 Vercel GOOGLE_APPS_SCRIPT_SECRET 完全相同的密碼
 */
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");
    const expected = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
    if (!expected || payload.secret !== expected) throw new Error("驗證失敗");
    if (payload.expectedVersion && payload.expectedVersion !== SCRIPT_VERSION) {
      throw new Error("Apps Script 版本不一致，目前版本：" + SCRIPT_VERSION + "，需要版本：" + payload.expectedVersion);
    }
    if (payload.action === "upsertReturnButton") {
      upsertReturnButton_(payload);
      return ContentService.createTextOutput(JSON.stringify({ ok: true, version: SCRIPT_VERSION }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    var missingFields = [];
    if (!payload.folderId) missingFields.push("folderId");
    if (!payload.title) missingFields.push("title");
    if (typeof payload.content !== "string" || !payload.content.trim()) missingFields.push("content");
    if (missingFields.length) throw new Error("缺少文件資料：" + missingFields.join("、"));

    const folder = DriveApp.getFolderById(payload.folderId);
    var finalTitle = payload.title;
    if (payload.createMode === "new") {
      var highestVersion = 0;
      var prefix = payload.title + ".新";
      var files = folder.getFiles();
      while (files.hasNext()) {
        var existingName = files.next().getName();
        if (existingName.indexOf(prefix) === 0) {
          var versionNumber = Number(existingName.substring(prefix.length));
          if (Number.isInteger(versionNumber)) highestVersion = Math.max(highestVersion, versionNumber);
        }
      }
      finalTitle = payload.title + ".新" + String(highestVersion + 1).padStart(2, "0");
    }

    const doc = DocumentApp.create(finalTitle);
    const body = doc.getBody();
    body.setText(payload.content);
    body.setMarginTop(28.3465).setMarginBottom(28.3465).setMarginLeft(28.3465).setMarginRight(28.3465);
    body.getParagraphs().forEach(function(paragraph) {
      paragraph.setSpacingBefore(0).setSpacingAfter(0).setLineSpacing(1);
    });
    if (payload.bookingNo) {
      var header = doc.addHeader();
      var headerParagraphs = header.getParagraphs();
      var headerParagraph = headerParagraphs.length ? headerParagraphs[0] : header.appendParagraph("");
      if (!headerParagraph) throw new Error("Google 文件頁首段落建立失敗");
      headerParagraph.setText("訂單編號：" + payload.bookingNo);
      headerParagraph.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
      headerParagraph.editAsText().setFontFamily("Arial").setFontSize(9).setForegroundColor("#777777");
      while (header.getNumChildren() > 1) header.removeChild(header.getChild(header.getNumChildren() - 1));
    }
    const editor = body.editAsText();
    // Google Docs 會自動移除 setText() 內容最後的換行，因此不能使用
    // payload.content.length 當作格式索引上限，必須以文件實際文字為準。
    const contentLength = editor.getText().length;
    const lastContentIndex = contentLength - 1;
    if (contentLength) editor.setFontFamily(0, lastContentIndex, "Arial").setFontSize(0, lastContentIndex, 14);

    (payload.marks || []).forEach(function(mark) {
      if (!contentLength) return;
      const start = Math.min(lastContentIndex, Math.max(0, Number(mark.start) - 1));
      const end = Math.min(lastContentIndex, Math.max(start, Number(mark.end) - 2));
      if (mark.kind === "meta") {
        editor.setFontSize(start, end, 10).setForegroundColor(start, end, "#736B66");
      } else if (mark.kind === "title") {
        editor.setBold(start, end, true).setFontSize(start, end, 20).setForegroundColor(start, end, "#6B3B24");
      } else if (mark.kind === "question") {
        editor.setBold(start, end, true).setForegroundColor(start, end, "#000000");
      } else if (mark.kind === "answer") {
        editor.setBold(start, end, false).setFontSize(start, end, 12).setForegroundColor(start, end, "#1A59CC");
      } else if (mark.kind === "teacher") {
        editor.setBold(start, end, false).setFontSize(start, end, 12).setForegroundColor(start, end, "#1A59CC");
      } else if (mark.kind === "section") {
        editor.setBold(start, end, true).setFontSize(start, end, 15).setForegroundColor(start, end, "#000000");
      } else if (mark.kind === "fieldLabel") {
        editor.setBold(start, end, true).setFontSize(start, end, 14).setForegroundColor(start, end, "#6B3B24");
      } else if (mark.kind === "fieldAnswer") {
        editor.setBold(start, end, false).setFontSize(start, end, 14).setForegroundColor(start, end, "#000000");
      }
    });

    (payload.images || []).forEach(function(imageSpec) {
      if (!imageSpec.marker || !imageSpec.dataUrl) return;
      var imageMatch = body.findText(escapeRegExp_(imageSpec.marker));
      if (!imageMatch) return;
      var imageParagraph = imageMatch.getElement();
      while (imageParagraph && imageParagraph.getType() !== DocumentApp.ElementType.PARAGRAPH) imageParagraph = imageParagraph.getParent();
      if (!imageParagraph) return;
      var imageIndex = body.getChildIndex(imageParagraph);
      var dataMatch = String(imageSpec.dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!dataMatch) return;
      var blob = Utilities.newBlob(Utilities.base64Decode(dataMatch[2]), dataMatch[1], "pet-photo");
      body.removeChild(imageParagraph);
      var inserted = body.insertImage(imageIndex, blob);
      var originalWidth = inserted.getWidth();
      var originalHeight = inserted.getHeight();
      var targetWidth = Math.max(80, Math.min(320, Number(imageSpec.width) || 220));
      if (originalWidth > 0 && originalHeight > 0) inserted.setWidth(targetWidth).setHeight(Math.round(originalHeight * targetWidth / originalWidth));
    });

    var pageBreakMatch;
    while ((pageBreakMatch = body.findText("\\[\\[\\[PAGE_BREAK\\]\\]\\]"))) {
      var paragraph = pageBreakMatch.getElement();
      while (paragraph && paragraph.getType() !== DocumentApp.ElementType.PARAGRAPH) paragraph = paragraph.getParent();
      if (!paragraph) break;
      var childIndex = body.getChildIndex(paragraph);
      body.removeChild(paragraph);
      body.insertPageBreak(childIndex);
    }

    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);
    if (payload.createMode !== "new") {
      (payload.previousDocumentIds || []).forEach(function(documentId) {
        if (documentId && documentId !== doc.getId()) {
          try { DriveApp.getFileById(documentId).setTrashed(true); } catch (ignored) {}
        }
      });
    }
    return ContentService.createTextOutput(JSON.stringify({
      ok: true,
      version: SCRIPT_VERSION,
      documentId: doc.getId(),
      documentUrl: doc.getUrl(),
      documentTitle: finalTitle,
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(error.message || error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function escapeRegExp_(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertReturnButton_(payload) {
  if (!payload.documentId || !payload.imageUrl || !payload.returnUrl) {
    throw new Error("缺少定位圖片資料：documentId、imageUrl 或 returnUrl");
  }
  const doc = DocumentApp.openById(payload.documentId);
  const body = doc.getBody();
  var paragraphs = body.getParagraphs();
  var anchor = null;
  for (var i = 0; i < paragraphs.length; i += 1) {
    if (String(paragraphs[i].getText() || "").indexOf(RETURN_BUTTON_ANCHOR) >= 0) {
      anchor = paragraphs[i];
      break;
    }
  }
  if (!anchor) anchor = body.insertParagraph(0, RETURN_BUTTON_ANCHOR);

  body.getImages().forEach(function(image) {
    if (image.getLinkUrl && image.getLinkUrl() === payload.returnUrl) image.removeFromParent();
  });

  anchor.getPositionedImages().forEach(function(image) {
    anchor.removePositionedImage(image.getId());
  });

  const response = UrlFetchApp.fetch(payload.imageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("無法下載回傳按鈕圖片，HTTP " + response.getResponseCode());
  }
  const blob = response.getBlob().setName("consultation-return-button.png");
  const positioned = anchor.addPositionedImage(blob);
  const originalWidth = positioned.getWidth();
  const originalHeight = positioned.getHeight();
  const targetWidth = 227;
  positioned
    .setWidth(targetWidth)
    .setHeight(Math.max(1, Math.round(originalHeight * targetWidth / Math.max(1, originalWidth))))
    .setLayout(DocumentApp.PositionedLayout.ABOVE_TEXT)
    .setLeftOffset(345)
    .setTopOffset(2);

  const returnedAt = String(payload.returnedAt || "").trim();
  const label = returnedAt ? "\n上次回傳時間：" + returnedAt : "";
  anchor.setText(RETURN_BUTTON_ANCHOR + label)
    .setAlignment(DocumentApp.HorizontalAlignment.RIGHT)
    .setSpacingBefore(0)
    .setSpacingAfter(0)
    .setLineSpacing(1)
    .setLinkUrl(payload.returnUrl);
  const editor = anchor.editAsText();
  editor.setFontFamily("Arial").setFontSize(1).setForegroundColor("#FFFFFF");
  editor.setLinkUrl(0, 0, payload.returnUrl);
  if (label) {
    editor.setLinkUrl(1, label.length, null);
    editor.setFontSize(2, label.length, 9).setForegroundColor(2, label.length, "#777777");
  }
  doc.saveAndClose();
}
