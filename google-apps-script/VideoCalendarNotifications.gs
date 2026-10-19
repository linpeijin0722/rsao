/**

 * 視訊通知系統

 *

 * 部署前請在 Apps Script「專案設定 → 指令碼屬性」新增：

 * LINE_TOKEN = 重新發行後的 LINE Messaging API Channel access token

 *

 * 請勿再把 token 寫在程式碼中。原先貼出的 token 已曝光，建議立即撤銷並重發。

 */



// ---------- 基本設定 ----------

var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");



var CALENDAR_ID = "ginshan820@gmail.com";



// 今日、明日、未來 30 天提醒：均、阿嫂

var USER_IDS = [

  "Ubb9918112f73f9d4be61a3bbf0e20c3b",

  "Ue97f8c49e2eb2a1d5490480c736b67f8"

];



// 三天內未回傳提醒：牛、啟恩、均

var CHECK_REMIND_USER_IDS = [

  "U3aa22cd5aeb99dc42e0300fbac78a062",

  "Ubcbf61c20c7872905e3ca778af71e0fd",

  "Ubb9918112f73f9d4be61a3bbf0e20c3b"

];



var NIU_USER_ID = "U3aa22cd5aeb99dc42e0300fbac78a062";

var QI_EN_USER_ID = "Ubcbf61c20c7872905e3ca778af71e0fd";

var ASAO_USER_ID = "Ue97f8c49e2eb2a1d5490480c736b67f8";



// 三天內視訊結果內容檢查資料夾

var FOLDER_ID = "1HMRq4GScXbSsqSwT4ssSDQHKktS29R8K";

var LIN_SHOU_JUN_FOLDER_ID = "1N--D6_R_Ldz2VyzGbPvgiKRoyw_K0iSq";

var SYSTEM_CREATE_FOLDER_ID = "1BcvOBxCVCFJj9n_MwLAJ0NrRViYaVyfQ";

var ASAO_PENDING_FOLDER_ID = "1pihxwGH-FJtWPiCAwBcSvs65L603HVu-";



var VIDEO_KEYWORD = "視訊";

var TEST_KEYWORD = "測試";

var TIME_ZONE = "Asia/Taipei";



// ---------- LINE 發送 ----------

function pushLineMessage(userId, textMessage) {

  if (!userId || typeof userId !== "string" || !userId.trim()) return;

  if (!textMessage || typeof textMessage !== "string" || !textMessage.trim()) return;

  if (!LINE_TOKEN) throw new Error("尚未設定指令碼屬性 LINE_TOKEN。請先在專案設定中新增。 ");



  var response = UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {

    method: "post",

    contentType: "application/json",

    headers: { Authorization: "Bearer " + LINE_TOKEN },

    payload: JSON.stringify({

      to: userId,

      messages: [{ type: "text", text: textMessage }]

    }),

    muteHttpExceptions: true

  });



  if (response.getResponseCode() !== 200) {

    Logger.log("LINE 推播失敗（代碼 " + response.getResponseCode() + "）：" + response.getContentText());

  }

}



function pushToUsers(userIds, message) {

  userIds.forEach(function(userId) {

    pushLineMessage(userId, message);

  });

}



// ---------- 共用格式與判斷 ----------

function taiwanParts(date) {
  var parts = Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd-HH-mm").split("-").map(Number);
  return { year:parts[0], month:parts[1], day:parts[2], hour:parts[3], minute:parts[4] };
}
function calendarDay(date, offset) {
  var key = Utilities.formatDate(date, TIME_ZONE, "yyyy-MM-dd");
  return new Date(new Date(key + "T00:00:00+08:00").getTime() + (offset || 0) * 86400000);
}
function formatCalendarDate(date) {
  var p=taiwanParts(date),weekday=new Date(Date.UTC(p.year,p.month-1,p.day)).getUTCDay();
  return p.month+"/"+p.day+"("+["日","一","二","三","四","五","六"][weekday]+")";
}
function formatEventTime(date, showDate) {
  if(showDate === undefined)showDate=true;
  var p=taiwanParts(date),period=p.hour<12?"早上":p.hour<18?"下午":"晚上";
  var time=period+(p.hour%12||12)+":"+("0"+p.minute).slice(-2);
  return (showDate?formatCalendarDate(date):"")+time;
}

function extractPersonName(title) {

  return String(title || "")

    .split(/[|｜]/)[0]

    .trim()

    .replace(/[^a-zA-Z\u4e00-\u9fa5 ]/g, "")

    .trim();

}



function isTestPerson(personName) {

  return !personName || personName.indexOf(TEST_KEYWORD) !== -1;

}



// 00:00:00～03:30:00（包含 03:30 整）都視為凌晨並排除。

function isIgnoredEarlyMorning(date) {

  // 明確以專案時區判斷，避免 Apps Script 執行環境與台灣時間不同。

  var hour = Number(Utilities.formatDate(date, TIME_ZONE, "H"));

  var minute = Number(Utilities.formatDate(date, TIME_ZONE, "m"));

  return hour * 60 + minute <= 3 * 60 + 30;

}



function containsVideo(title) {

  return String(title || "").indexOf(VIDEO_KEYWORD) !== -1;

}



function startOfDay(date) { return calendarDay(date,0); }
function endOfDay(date) { return new Date(calendarDay(date,1).getTime()-1); }
function isSameLocalDay(a,b) { return Utilities.formatDate(a,TIME_ZONE,"yyyy-MM-dd")===Utilities.formatDate(b,TIME_ZONE,"yyyy-MM-dd"); }

// 每個活動就是一筆訂單。只排除姓名與LINE名稱同時符合的客服測試單。
function eventIdentity(event) {
  var description=String(event.getDescription()||"").replace(/<br\s*\/?\s*>/gi,"\n").replace(/<[^>]+>/g,"");
  var match=description.match(/(?:^|\n)\s*LINE\s*(?:名稱|名字|暱稱)\s*[:：]\s*([^\n]*)/i);
  var order=description.match(/(?:^|\n)\s*訂單編號\s*[:：]\s*([^\n]*)/);
  return {name:extractPersonName(event.getTitle()),lineName:match?match[1].trim():"",bookingNo:order?order[1].trim():""};
}
function isStaffTestEvent(event) {
  var p=eventIdentity(event);
  return (p.name==="林珮均"&&p.lineName==="Peggy")||(p.name==="林啟恩"&&p.lineName==="Nnn");
}
function listVideoOrders(from,to) {
  var calendar=CalendarApp.getCalendarById(CALENDAR_ID);
  if(!calendar)throw new Error("找不到行事曆或無讀取權限："+CALENDAR_ID);
  return calendar.getEvents(from,to).filter(function(event){
    var p=eventIdentity(event);
    if(!containsVideo(event.getTitle())||isTestPerson(p.name)||event.isAllDayEvent()||isIgnoredEarlyMorning(event.getStartTime())||isStaffTestEvent(event))return false;
    if((p.name==="林珮均"||p.name==="林啟恩")&&!p.lineName)throw new Error("尚未補齊客服同名活動的LINE名稱，已停止本次通知，請先同步行事曆資料："+p.name+"／"+p.bookingNo);
    return true;
  }).sort(function(a,b){return a.getStartTime()-b.getStartTime()});
}
function eventReminderLine(event,showDate) {
  var p=eventIdentity(event);
  return formatEventTime(event.getStartTime(),showDate)+" - "+p.name+(p.bookingNo?"（"+p.bookingNo+"）":"");
}

function listFiles(folderId) {

  var iterator = DriveApp.getFolderById(folderId).getFiles();

  var files = [];

  while (iterator.hasNext()) files.push(iterator.next());

  return files;

}



// ---------- 今日／明日視訊提醒 ----------

function checkTodayEvents() {

  sendVideoReminder("今天");

}



function checkTomorrowVideoEvents() {

  sendVideoReminder("明天");

}



function buildVideoReminder(type) {
  var targetDate=calendarDay(new Date(),type==="今天"?0:1),events=listVideoOrders(startOfDay(targetDate),endOfDay(targetDate));
  if(!events.length)return "";
  var heading=(type==="今天"?"🙋‍♀️今天":"🔔 明天")+formatCalendarDate(targetDate)+"視訊提醒";
  return heading+"\n\n"+events.map(function(event){return eventReminderLine(event,false)}).join("\n");
}
function sendVideoReminder(type) {
  var message=buildVideoReminder(type);
  if(message)pushToUsers(USER_IDS,message);
}

// ---------- 三天內未回傳：改查檔案內容 ----------

function checkThreeDaysBeforeVideoEvents() {
  var properties=PropertiesService.getScriptProperties(),secret=properties.getProperty('BOOKING_CRON_SECRET');
  var site=(properties.getProperty('BOOKING_SITE_URL')||'https://rsao-virid.vercel.app').replace(/\/$/,'');
  if(!secret)throw new Error('請設定 BOOKING_CRON_SECRET，與網站 CRON_SECRET 相同；未確認資料回傳狀態前不發通知。');
  var response=UrlFetchApp.fetch(site+'/api/cron/result-reminder-status',{headers:{Authorization:'Bearer '+secret},muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw new Error('讀取資料回傳狀態失敗，本次未發通知。');
  var orders=JSON.parse(response.getContentText()).orders;
  if(!Array.isArray(orders))throw new Error('回傳狀態格式錯誤');
  var files=returnedFolderFiles(DriveApp.getFolderById(FOLDER_ID)),pending=orders.filter(function(order){return !orderIsReturned(order,files)});
  pending.sort(function(a,b){return new Date(a.slotStart)-new Date(b.slotStart)});
  var heading='⚠️ 請確認「諮詢結果」是否已經回傳',lines=[];
  pending.forEach(function(order){
    var date=new Date(order.slotStart),hour=Number(Utilities.formatDate(date,TIME_ZONE,'H'));
    var weekday=['日','一','二','三','四','五','六'][Number(Utilities.formatDate(date,TIME_ZONE,'u'))%7];
    var time=Utilities.formatDate(date,TIME_ZONE,'M/d')+'（'+weekday+'）'+(hour<12?'上午':'下午')+' '+(hour%12||12)+':'+Utilities.formatDate(date,TIME_ZONE,'mm');
    var line='⏰ '+time+' '+(order.lineName||order.name)+(order.lineName&&order.name?'（'+order.name+'）':'');
    if((heading+'\n'+lines.concat(line).join('\n')).length>4500&&lines.length){pushToUsers(CHECK_REMIND_USER_IDS,heading+'\n'+lines.join('\n'));lines=[]}
    lines.push(line);
  });
  if(lines.length)pushToUsers(CHECK_REMIND_USER_IDS,heading+'\n'+lines.join('\n'));
}

function returnedFolderFiles(folder){
 var files=listFiles(folder.getId()).filter(function(file){return !file.isTrashed()});
 var children=folder.getFolders();while(children.hasNext())files=files.concat(returnedFolderFiles(children.next()));
 return files;
}
function orderIsReturned(order,files){
 // Match known document IDs first. Names alone must not match a different booking.
 var ids=order.documentIds||[];
 if(ids.length)return ids.every(function(id){return files.some(function(file){return file.getId()===id||(file.getMimeType()==='application/vnd.google-apps.shortcut'&&file.getTargetId()===id)})});
 return files.some(function(file){
  if(file.getName().indexOf(order.bookingNo)!==-1)return true;
  if(file.getMimeType()!=='application/vnd.google-apps.document')return false;
  return DocumentApp.openById(file.getId()).getBody().getText().indexOf(order.bookingNo)!==-1;
 });
}

/**

 * 使用 Drive 的 fullText 索引查「檔案內容」，不是查檔名。

 * Google 文件、可索引的 PDF／Office／純文字等可被搜尋；圖片或掃描 PDF 若沒有

 * 可搜尋文字（OCR 尚未建立索引），Drive 無法判斷其內容。這裡只查指定資料夾

 * 的直接子檔案，不會跨入子資料夾。

 */

function folderHasFileContent(folderId, searchText) {

  var safeText = String(searchText).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

  var query = "fullText contains '" + safeText + "' and trashed = false";

  return DriveApp.getFolderById(folderId).searchFiles(query).hasNext();

}



// ---------- 未來 30 天視訊整理 ----------

function buildWeeklyVideoSummary() {
  var now=new Date(),events=listVideoOrders(now,new Date(now.getTime()+30*86400000));
  if(!events.length)return "";
  var lines=["📅 未來30天視訊提醒",""],lastDate="";
  events.forEach(function(event){
    var key=Utilities.formatDate(event.getStartTime(),TIME_ZONE,"yyyy-MM-dd");
    if(key!==lastDate){if(lastDate)lines.push("");lines.push(formatCalendarDate(event.getStartTime()));lastDate=key;}
    lines.push(eventReminderLine(event,false));
  });
  return lines.join("\n");
}
function sendWeeklyVideoSummary() {
  var message=buildWeeklyVideoSummary();if(message)pushToUsers(USER_IDS,message);
}
// 執行此函式只會在執行紀錄預覽，不會發送LINE。
function previewCalendarNotifications() {
  Logger.log("行事曆來源："+CALENDAR_ID);
  Logger.log(buildVideoReminder("今天")||"今天沒有需通知的視訊訂單");
  Logger.log(buildVideoReminder("明天")||"明天沒有需通知的視訊訂單");
  Logger.log(buildWeeklyVideoSummary()||"未來30天沒有需通知的視訊訂單");
}

// ---------- 林守君資料夾：有「視訊」檔案就通知牛 ----------

function checkLinShouJunVideoFiles() {

  var names = listFiles(LIN_SHOU_JUN_FOLDER_ID)

    .map(function(file) { return file.getName(); })

    .filter(function(name) { return name.indexOf(VIDEO_KEYWORD) !== -1; })

    .sort();



  if (names.length) {

    pushLineMessage(NIU_USER_ID, "目前尚未回傳視訊諮詢：\n" + names.join("\n"));

  }

}



// ---------- 系統建立資料夾：當日「視訊」檔案通知啟恩 ----------

function checkTodaySystemCreateVideoFiles() {

  var today = new Date();

  var names = listFiles(SYSTEM_CREATE_FOLDER_ID)

    .filter(function(file) {

      if (file.getName().indexOf(VIDEO_KEYWORD) === -1) return false;

      // 「當日」合理解讀為：建立日期或最後更新日期，任一與今天相同即列入。

      return isSameLocalDay(file.getDateCreated(), today) || isSameLocalDay(file.getLastUpdated(), today);

    })

    .map(function(file) { return file.getName(); })

    .sort();



  if (names.length) {

    pushLineMessage(QI_EN_USER_ID, "目前尚未建立的視訊單有\n" + names.join("\n"));

  }

}



// ---------- 阿嫂待處理：未來三個日曆日內視訊檔案 ----------

function checkAsaoPendingVideoFiles() {

  var today = startOfDay(new Date());

  var endDate = endOfDay(calendarDay(today,2));

  var matchedNames = [];



  listFiles(ASAO_PENDING_FOLDER_ID).forEach(function(file) {

    var name = file.getName();

    if (name.indexOf(VIDEO_KEYWORD) === -1) return;

    var parsedDate = parseDateFromFileName(name, today);

    if (!parsedDate) {

      Logger.log("無法從檔名可靠解析日期，已略過：" + name);

      return;

    }

    if (parsedDate >= today && parsedDate <= endDate) matchedNames.push(name);

  });



  matchedNames.sort().forEach(function(name) {

    pushLineMessage(QI_EN_USER_ID, "請確認" + name + "尚未回傳。");

    pushLineMessage(ASAO_USER_ID, name + "要先寫");

  });

}



/**

 * 從檔名解析日期。支援：

 * 2026/8/13、2026-08-13、2026.8.13、2026年8月13日、20260813、

 * 民國115年8月13日／115-8-13，以及 8/13、8-13、8月13日。

 *

 * 只有月／日時，先採今年；若該日已早於今天，改採明年，方便跨年排程。

 * 不猜測 0813 這類沒有分隔符的月日，以免把編號誤認成日期。

 * 找不到合法日期時回傳 null，由呼叫端記錄並略過，便於日後擴充格式。

 */

function parseDateFromFileName(fileName, referenceDate) {

  var name = String(fileName || "");

  var match;

  var year;

  var month;

  var day;



  match = name.match(/(?:民國\s*)?(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);

  if (match && Number(match[1]) < 1000) {

    year = Number(match[1]) + 1911;

    month = Number(match[2]);

    day = Number(match[3]);

    return makeValidLocalDate(year, month, day);

  }



  match = name.match(/(?:^|\D)(20\d{2})[\/_.-](\d{1,2})[\/_.-](\d{1,2})(?:\D|$)/);

  if (!match) match = name.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);

  if (!match) match = name.match(/(?:^|\D)(20\d{2})(\d{2})(\d{2})(?:\D|$)/);

  if (match) {

    return makeValidLocalDate(Number(match[1]), Number(match[2]), Number(match[3]));

  }



  match = name.match(/(?:^|\D)(\d{2,3})[\/_.-](\d{1,2})[\/_.-](\d{1,2})(?:\D|$)/);

  if (match && Number(match[1]) < 1000) {

    return makeValidLocalDate(Number(match[1]) + 1911, Number(match[2]), Number(match[3]));

  }



  match = name.match(/(?:^|\D)(\d{1,2})[\/.-](\d{1,2})(?:\D|$)/);

  if (!match) match = name.match(/(?:^|\D)(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);

  if (!match) return null;



  month = Number(match[1]);

  day = Number(match[2]);

  year = taiwanParts(referenceDate).year;

  var candidate = makeValidLocalDate(year, month, day);

  if (!candidate) return null;

  if (candidate < startOfDay(referenceDate)) candidate = makeValidLocalDate(year + 1, month, day);

  return candidate;

}



function makeValidLocalDate(year,month,day) {
  var date=new Date(year+"-"+("0"+month).slice(-2)+"-"+("0"+day).slice(-2)+"T00:00:00+08:00");
  if(!isFinite(date.getTime()))return null;
  var p=taiwanParts(date);return p.year===year&&p.month===month&&p.day===day?date:null;
}

// 可設一個每日定時觸發器執行此函式，集中跑三個新增的 Drive 檢查。

function runDailyDriveChecks() {

  checkLinShouJunVideoFiles();

  checkTodaySystemCreateVideoFiles();

  checkAsaoPendingVideoFiles();

}



// ---------- LINE Webhook：啟恩傳「改時間」時轉傳給牛 ----------

function doPost(e) {

  try {

    if (!e || !e.postData || !e.postData.contents) return textResponse("OK");

    var body = JSON.parse(e.postData.contents);

    var events = body.events || [];



    events.forEach(function(event) {

      var senderId = event.source && event.source.userId;

      var isTextMessage = event.type === "message" && event.message && event.message.type === "text";

      if (!isTextMessage || senderId !== QI_EN_USER_ID) return;



      var messageText = String(event.message.text || "");

      if (messageText.indexOf("改時間") !== -1) {

        pushLineMessage(NIU_USER_ID, messageText);

      }

    });

  } catch (error) {

    Logger.log("LINE Webhook 處理失敗：" + error.stack);

    // 仍回 200，避免 LINE 因程式錯誤反覆重送同一事件。

  }

  return textResponse("OK");

}



function doGet() {

  return textResponse("LINE Webhook is running.");

}



function textResponse(text) {

  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);

}
