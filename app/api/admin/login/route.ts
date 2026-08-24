import { NextRequest, NextResponse } from "next/server";
import { makeAdminSession } from "@/lib/admin-session";
export async function POST(r: NextRequest) {
  const { password, remember } = await r.json();
  if (!process.env.ADMIN_PASSWORD || password !== process.env.ADMIN_PASSWORD)
    return NextResponse.json({ error: "管理密碼錯誤" }, { status: 401 });
  const x = NextResponse.json({ ok: true });
  x.cookies.set("admin_session", makeAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : 28800,
  });
  return x;
}
