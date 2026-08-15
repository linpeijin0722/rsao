import { createHmac, timingSafeEqual } from "crypto";

const secret = () => {
  const value = process.env.LINE_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("LINE_SESSION_SECRET 至少需要 32 個字元");
  return value;
};

export function signLineSession(uid: string) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const payload = Buffer.from(JSON.stringify({ uid, expires })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyLineSession(value?: string) {
  if (!value) return null;
  try {
    const [payload, signature] = value.split(".");
    const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
    if (!signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { uid: string; expires: number };
    return data.expires > Date.now() / 1000 ? data.uid : null;
  } catch { return null; }
}
