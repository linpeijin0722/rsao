import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isAdminSession } from "@/lib/admin-session";

export async function POST(request: NextRequest) {
  if (!isAdminSession((await cookies()).get("admin_session")?.value))
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  const { lineUserId, message } = await request.json();
  if (!lineUserId || !String(message || "").trim())
    return NextResponse.json({ error: "缺少用戶或訊息內容" }, { status: 400 });
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) return NextResponse.json({ error: "尚未設定 LINE 訊息金鑰" }, { status: 500 });
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: "text", text: String(message).trim() }] }),
  });
  if (!response.ok) return NextResponse.json({ error: `LINE 傳送失敗：${await response.text()}` }, { status: 502 });
  return NextResponse.json({ ok: true });
}
