export async function pushLineFlex(
  userId: string,
  altText: string,
  bubble: Record<string, unknown>,
) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("尚未設定 LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "flex", altText, contents: bubble }],
    }),
  });
  if (!response.ok)
    throw new Error(`LINE 訊息發送失敗：${await response.text()}`);
}

export async function pushLineText(userId: string, text: string) {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("尚未設定 LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }],
    }),
  });
  if (!response.ok)
    throw new Error(`LINE 訊息發送失敗：${await response.text()}`);
}
const statusColors={pending:{background:"#FDECEC",text:"#C94040",label:"待付款"},paid:{background:"#EBFBF9",text:"#168A54",label:"已付款"},data_required:{background:"#FDECEC",text:"#C94040",label:"請填寫諮詢者資料"},changed:{background:"#F1F1F1",text:"#444444",label:"預約已變更"}} as const;
const bookingLiffId = process.env.NEXT_PUBLIC_LIFF_ID || "2010145548-jmc9lP5o";
export const liffPageUrl = (path: string, params?: URLSearchParams) =>
  `https://liff.line.me/${bookingLiffId}${path}${params?.size ? `?${params}` : ""}`;
export const liffBookingDataUrl = (bookingNo: string) =>
  liffPageUrl("/booking-data", new URLSearchParams({ order: bookingNo }));
const cleanItemTitle=(value:string)=>value.replace(/(兩位嬰靈[（(]含[）)]以上).*/u,"$1").replace(/[（(]?無論幾位[^）)]*[）)]?/g,"").replace(/^＋加購[：:]\s*/u,"").replace(/\s+/g," ").trim();
function videoDateParts(slotStart?:string){if(!slotStart)return null;const date=new Date(slotStart);if(Number.isNaN(date.getTime()))return null;const parts=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",month:"numeric",day:"numeric",weekday:"short"}).formatToParts(date),part=(type:string)=>parts.find(x=>x.type===type)?.value||"",time=new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Taipei",hour:"numeric",minute:"2-digit",hour12:true}).format(date).replace(/\s/g,"");return{date:`${part("month")}月${part("day")}日（${part("weekday").replace("週","")}）`,time}}
export function bookingStatusFlex(args:{status:"pending"|"paid"|"data_required"|"changed";headerLabel?:string;bookingNo:string;method:string;total?:number;slotStart?:string;items?:string[];site:string;expiresAt?:string;calendarSlot?:string}){
  const theme=statusColors[args.status],isVideo=args.method==="video",needsData=args.status==="paid"||args.status==="data_required",video=videoDateParts(args.slotStart),numbered=(args.items||[]).map(cleanItemTitle).filter(Boolean).map((title,index)=>`${["❶","❷","❸","❹","❺","❻","❼","❽","❾"][index]||`${index+1}.`}${title}`).join("\n"),mainUrl=args.status==="pending"?`${args.site}/pay?order=${encodeURIComponent(args.bookingNo)}`:needsData?liffBookingDataUrl(args.bookingNo):`${args.site}/my-bookings?order=${encodeURIComponent(args.bookingNo)}`,buttonLabel=args.status==="pending"?"繼續付款":needsData?"📝 立即填寫問事資料（必填）":"查看預約",body:any[]=[{type:"text",text:isVideo?"視訊諮詢":"文字諮詢",align:"center",weight:"bold",size:"lg"},{type:"separator",margin:"md"}];
  if(video)body.push({type:"text",text:"預約時間",color:"#222222",size:"sm",margin:"lg"},{type:"text",text:video.date,wrap:true,color:"#168A54",weight:"bold",size:"xxl"},{type:"text",text:video.time,wrap:true,color:"#168A54",weight:"bold",size:"xxl"});
  if(numbered)body.push({type:"text",text:`諮詢項目\n${numbered}`,wrap:true,margin:"lg",color:"#333333",size:"md"});
  if(typeof args.total==="number")body.push({type:"text",text:`付款金額：NT$ ${args.total.toLocaleString("zh-TW")}`,color:"#8A3045",weight:"bold",margin:"md"});
  if(args.status==="pending"&&args.expiresAt)body.push({type:"text",text:`請於 ${new Date(args.expiresAt).toLocaleString("zh-TW",{timeZone:"Asia/Taipei"})} 前完成付款，逾期訂單將自動失效。`,wrap:true,color:"#666666",size:"sm"});
  const footer:any[]=[{type:"button",style:"primary",height:"md",color:args.status==="changed"?"#4A78C2":args.status==="paid"?"#168A54":"#C94040",action:{type:"uri",label:buttonLabel,uri:mainUrl}}];
  if(args.status==="paid"&&isVideo&&args.calendarSlot)footer.push({type:"button",style:"link",height:"sm",action:{type:"uri",label:"加入 Google 行事曆",uri:`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("林阿嫂視訊諮詢")}&dates=${args.calendarSlot}`}});
  return{type:"bubble",header:{type:"box",layout:"vertical",backgroundColor:theme.background,contents:[{type:"text",text:args.headerLabel||theme.label,color:theme.text,weight:"bold",size:"xl",align:"center"},{type:"text",text:`訂單編號：${args.bookingNo}`,color:"#8B8B8B",size:"xs",align:"center",margin:"sm",wrap:true}]},body:{type:"box",layout:"vertical",spacing:"md",contents:body},footer:{type:"box",layout:"vertical",spacing:"sm",contents:footer}};
}
export function bookingFlex(args: {
  bookingNo: string;
  method: string;
  total: number;
  slot?: string;
  slotStart?: string;
  items?: string[];
  site: string;
}) {
  return bookingStatusFlex({status:"paid",bookingNo:args.bookingNo,method:args.method,total:args.total,slotStart:args.slotStart,items:args.items,site:args.site,calendarSlot:args.slot});
  /* legacy paid layout
  const isVideo = args.method === "video",
    dataUrl = `${args.site}/booking-data?order=${encodeURIComponent(args.bookingNo)}`;
  const buttons: any[] = [
    {
      type: "box",
      layout: "horizontal",
      justifyContent: "center",
      alignItems: "center",
      spacing: "sm",
      paddingAll: "14px",
      backgroundColor: "#EAF7EE",
      cornerRadius: "10px",
      action: { type: "uri", uri: dataUrl },
      contents: [
        { type: "text", text: "📝", size: "lg", flex: 0 },
        { type: "text", text: "立即填寫問事資料（必填）", color: "#218548", weight: "bold", align: "center", flex: 0 },
      ],
    },
  ];
  if (isVideo && args.slot)
    buttons.push({
      type: "button",
      style: "link",
      height: "sm",
      action: {
        type: "uri",
        label: "加入 Google 行事曆",
        uri: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("林阿嫂視訊諮詢")}&dates=${args.slot}`,
      },
    });
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#EAF7EE",
      contents: [
        {
          type: "text",
          text: "已付款",
          color: "#218548",
          weight: "bold",
          size: "xl",
        },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `訂單編號：${args.bookingNo}`,
          weight: "bold",
          wrap: true,
        },
        {
          type: "text",
          text: `付款金額：NT$ ${args.total.toLocaleString("zh-TW")}`,
          color: "#8A3045",
          weight: "bold",
        },
        ...(isVideo && args.slotStart
          ? [
              {
                type: "text",
                text: `視訊時間\n${new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(args.slotStart))}`,
                color: "#218548",
                weight: "bold",
                size: "xl",
                align: "center",
                wrap: true,
              },
            ]
          : []),
        ...(args.items?.length
          ? [
              {
                type: "text",
                text: `預約項目\n${args.items.join("\n")}`,
                color: "#4D453F",
                wrap: true,
              },
            ]
          : []),
        {
          type: "box",
          layout: "vertical",
          height: "64px",
          paddingTop: "4px",
          paddingBottom: "4px",
          justifyContent: "center",
          alignItems: "center",
          contents: [
            {
              type: "text",
              text: "↓",
              color: "#9A9A9A",
              weight: "bold",
              size: "3xl",
              align: "center",
              gravity: "center",
            },
          ],
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons,
    },
  }; */
}

export function videoReminderFlex(args: {
  bookingNo: string;
  slotStart: string;
  site: string;
  isTomorrow?: boolean;
}) {
  const dateParts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(args.slotStart));
  const part = (type: string) => dateParts.find((entry) => entry.type === type)?.value || "";
  const weekday = part("weekday").replace(/星期|週/g, "");
  const period = part("dayPeriod").replace("凌晨", "上午");
  const appointmentTime = `${part("month")}/${part("day")}(${weekday})${period}${Number(part("hour"))}:${part("minute")}`;
  return {
    type: "bubble",
    hero: {
      type: "image",
      url: `${args.site}/video-reminder-guide.png`,
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "cover",
    },
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFF4E5",
      contents: [
        {
          type: "text",
          text: "【諮詢提醒】明天準時與老師視訊對談喔！",
          color: "#8A5A24",
          weight: "bold",
          size: "xl",
        },
        { type: "text", text: `預約時間：${appointmentTime}`, color: "#6B625B", size: "sm", wrap: true },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: `提醒您：您預約的視訊諮詢時間是 ${appointmentTime}\n建議可以先準備好想詢問的問題唷！\n\n提醒您：視訊諮詢的預約時段一律以台灣時間（GMT+8）為準，請您確認時區無誤喔！😊\n\n我們會在時間到時 主動發送通話邀請 給您，請留意訊息通知。\n\n收到邀請後，請依照下方步驟操作，即可開始視訊：\n\n👉 點選「通話」\n👉 再點「開始視訊」\n\n⚠️ 請記得保持 LINE 開啟，並連上網路，才不會錯過通話邀請～\n\n期待與您線上見面🙏`,
          wrap: true,
          color: "#4D453F",
        },
        { type: "text", text: `訂單編號：${args.bookingNo}`, wrap: true, color: "#8B8B8B", size: "xs" },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#8A3045",
          action: {
            type: "uri",
            label: "查看我的預約",
            uri: `${args.site}/my-bookings?order=${encodeURIComponent(args.bookingNo)}`,
          },
        },
      ],
    },
  };
}
