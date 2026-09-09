const SCRIPT_VERSION = "2026-09-09-v15";
const RETURN_BUTTON_ANCHOR = "\u200B";
const RETURN_BUTTON_ALT_TITLE = "RSAO_CONSULTATION_RETURN_BUTTON";

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

    if (payload.cancelledWarning) {
      insertDocumentWarning_(body, "此筆訂單已取消，請確認。");
    }

    doc.saveAndClose();
    DriveApp.getFileById(doc.getId()).moveTo(folder);

    // 新文件成功建立後，兩種重建模式都先在每一份舊文件加上警告。
    // 覆蓋模式必須等警告確實寫入後，才可以把舊文件移到垃圾桶。
    (payload.previousDocumentIds || []).forEach(function(documentId) {
      if (!documentId || documentId === doc.getId()) return;
      var previousDoc = DocumentApp.openById(documentId);
      insertDocumentWarning_(previousDoc.getBody(), "此筆訂單已建立新諮詢單，請確認。");
      previousDoc.saveAndClose();
    });
    if (payload.createMode !== "new") {
      (payload.previousDocumentIds || []).forEach(function(documentId) {
        if (documentId && documentId !== doc.getId()) {
          DriveApp.getFileById(documentId).setTrashed(true);
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

function insertDocumentWarning_(body, warning) {
  if (String(body.getText() || "").indexOf(warning) >= 0) return;
  var paragraph = body.insertParagraph(0, warning);
  paragraph.setSpacingBefore(0).setSpacingAfter(4).setLineSpacing(1);
  var styled = paragraph.editAsText();
  styled
    .setBold(0, warning.length - 1, true)
    // Google 文件使用 pt；17.25pt 約等於畫面上的 23px。
    .setFontSize(0, warning.length - 1, 17.25)
    .setForegroundColor(0, warning.length - 1, "#FFFA6A")
    .setBackgroundColor(0, warning.length - 1, "#CC0000");
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

  function isReturnButtonImage_(image) {
    var altTitle = "";
    var linkUrl = "";
    try { altTitle = String(image.getAltTitle() || ""); } catch (ignored) {}
    try { linkUrl = String(image.getLinkUrl() || ""); } catch (ignored) {}
    return altTitle === RETURN_BUTTON_ALT_TITLE ||
      linkUrl === payload.returnUrl ||
      linkUrl.indexOf("/staff/consultation-return") >= 0;
  }

  function clearReturnButtons_(section) {
    if (!section) return;
    var imageParents = [];
    section.getImages().slice().forEach(function(image) {
      if (!isReturnButtonImage_(image)) return;
      var parent = image.getParent();
      image.removeFromParent();
      if (parent && parent.getType() === DocumentApp.ElementType.PARAGRAPH) imageParents.push(parent);
    });
    imageParents.forEach(function(paragraph) {
      if (paragraph.getParent() !== section) return;
      var visibleText = String(paragraph.getText() || "").replace(/\u200B/g, "").trim();
      if (!visibleText) section.removeChild(paragraph);
    });
    var paragraphs = section.getParagraphs();
    for (var index = paragraphs.length - 1; index >= 0; index -= 1) {
      var paragraph = paragraphs[index];
      if (paragraph.getParent() !== section) continue;
      var text = String(paragraph.getText() || "");
      var cleanText = text.replace(/\u200B/g, "").trim();
      if (text.indexOf(RETURN_BUTTON_ANCHOR) < 0 && cleanText.indexOf("上次回傳時間：") !== 0) continue;
      paragraph.getPositionedImages().forEach(function(image) {
        paragraph.removePositionedImage(image.getId());
      });
      section.removeChild(paragraph);
    }
  }

  // 每次同步前清乾淨所有舊版本，確保文件永遠只會有一個按鈕。
  clearReturnButtons_(body);
  clearReturnButtons_(doc.getHeader());

  const response = UrlFetchApp.fetch(payload.imageUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error("無法下載回傳按鈕圖片，HTTP " + response.getResponseCode());
  }
  const blob = response.getBlob().setName("consultation-return-button.png");

  // 按鈕直接放在正文第一行。InlineImage 可設定圖片本身的超連結，
  // 小尺寸只占一行，不再使用頁首，也不建立左右欄。
  var buttonParagraph = body.insertParagraph(0, RETURN_BUTTON_ANCHOR);
  buttonParagraph
    .setAlignment(DocumentApp.HorizontalAlignment.LEFT)
    .setSpacingBefore(0)
    .setSpacingAfter(0)
    .setLineSpacing(1);
  var markerText = buttonParagraph.editAsText();
  markerText.setFontSize(0, 0, 1).setForegroundColor(0, 0, "#FFFFFF");

  const linkedImage = buttonParagraph.appendInlineImage(blob)
    .setAltTitle(RETURN_BUTTON_ALT_TITLE)
    .setAltDescription("回傳諮詢者結果")
    .setLinkUrl(payload.returnUrl);
  const originalWidth = linkedImage.getWidth();
  const originalHeight = linkedImage.getHeight();
  const targetWidth = 180;
  linkedImage
    .setWidth(targetWidth)
    .setHeight(Math.max(1, Math.round(originalHeight * targetWidth / Math.max(1, originalWidth))));

  const returnedAt = String(payload.returnedAt || "").trim();
  if (returnedAt) {
    var timeParagraph = body.insertParagraph(1, RETURN_BUTTON_ANCHOR + "上次回傳時間：" + returnedAt);
    timeParagraph
      .setAlignment(DocumentApp.HorizontalAlignment.LEFT)
      .setSpacingBefore(0)
      .setSpacingAfter(0)
      .setLineSpacing(1);
    var timeEditor = timeParagraph.editAsText();
    timeEditor.setFontFamily("Arial").setFontSize(9).setForegroundColor("#777777");
    timeEditor.setFontSize(0, 0, 1).setForegroundColor(0, 0, "#FFFFFF");
  }
  doc.saveAndClose();
}
