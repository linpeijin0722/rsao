import { NextRequest, NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { signLineSession } from "@/lib/line-session";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json();
    if (!accessToken) return NextResponse.json({ error: "缺少 LINE 登入憑證" }, { status: 401 });
    const verify = await fetch(`https://api.line.me/oauth2/v2.1/verify?access_token=${encodeURIComponent(accessToken)}`, { cache: "no-store" });
    const tokenInfo = await verify.json();
    if (!verify.ok || tokenInfo.client_id !== process.env.LINE_LOGIN_CHANNEL_ID) return NextResponse.json({ error: "LINE 登入憑證無效" }, { status: 401 });
    const profileResponse = await fetch("https://api.line.me/v2/profile", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || !profile.userId) return NextResponse.json({ error: "無法取得 LINE 使用者資料" }, { status: 401 });
    const { error } = await adminSupabase().from("customers").upsert({ line_user_id: profile.userId, line_display_name: profile.displayName, line_picture_url: profile.pictureUrl ?? null, updated_at: new Date().toISOString() }, { onConflict: "line_user_id" });
    if (error) throw error;
    const response = NextResponse.json({ displayName: profile.displayName, pictureUrl: profile.pictureUrl ?? null });
    response.cookies.set("line_session", signLineSession(profile.userId), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 12 });
    return response;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "LINE 登入失敗" }, { status: 500 }); }
}
