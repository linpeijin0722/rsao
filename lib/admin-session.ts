import { createHmac, timingSafeEqual } from "crypto";
const secret = () => {
  const v = process.env.ADMIN_SESSION_SECRET;
  if (!v || v.length < 32)
    throw new Error("ADMIN_SESSION_SECRET 至少需要32字元");
  return v;
};
export function makeAdminSession() {
  const exp = Math.floor(Date.now() / 1000) + 28800,
    p = Buffer.from(String(exp)).toString("base64url"),
    s = createHmac("sha256", secret()).update(p).digest("base64url");
  return `${p}.${s}`;
}
export function isAdminSession(v?: string) {
  try {
    if (!v) return false;
    const [p, s] = v.split("."),
      e = createHmac("sha256", secret()).update(p).digest("base64url");
    return (
      !!s &&
      timingSafeEqual(Buffer.from(s), Buffer.from(e)) &&
      Number(Buffer.from(p, "base64url").toString()) > Date.now() / 1000
    );
  } catch {
    return false;
  }
}
