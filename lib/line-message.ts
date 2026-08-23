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
      type: "button",
      style: "primary",
      height: "md",
      color: "#8A3045",
      action: { type: "uri", label: "立即填寫問事資料（必填）", uri: dataUrl },
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
          text: "重要提醒：請務必填寫問事資料！這是提供給阿嫂老師觀靈的重要資料，完成填寫後才能進行後續諮詢。",
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
