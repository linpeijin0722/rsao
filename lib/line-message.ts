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
export function bookingFlex(args: {
  bookingNo: string;
  method: string;
  total: number;
  slot?: string;
  site: string;
}) {
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
      backgroundColor: "#8A3045",
      cornerRadius: "10px",
      action: { type: "uri", uri: dataUrl },
      contents: [
        { type: "text", text: "📝", size: "lg", flex: 0 },
        { type: "text", text: "立即填寫問事資料（必填）", color: "#FFFFFF", weight: "bold", align: "center", flex: 0 },
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
        {
          type: "text",
          text: "請記得填寫問事資料\n這是阿嫂老師進行諮詢的重要資料；完成填寫後，我們才能接續安排。請點選下方按鈕填寫，謝謝您。",
          wrap: true,
          color: "#B42332",
          weight: "bold",
          size: "md",
        },
      ],
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons,
    },
  };
}

export function videoReminderFlex(args: {
  bookingNo: string;
  slotStart: string;
  site: string;
}) {
  const date = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(args.slotStart));
  return {
    type: "bubble",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#FFF4E5",
      contents: [
        {
          type: "text",
          text: "明日視訊諮詢提醒",
          color: "#8A5A24",
          weight: "bold",
          size: "xl",
        },
        { type: "text", text: "林阿嫂線上諮詢", color: "#6B625B", size: "sm" },
      ],
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: `預約時間：${date}`, weight: "bold", wrap: true },
        { type: "text", text: `訂單編號：${args.bookingNo}`, wrap: true, color: "#6B625B" },
        {
          type: "text",
          text: "溫馨提醒您，明天有林阿嫂視訊諮詢預約。請預先確認 LINE 訊息與網路連線正常，並留意助理傳送的視訊連結。",
          wrap: true,
          color: "#4D453F",
        },
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
