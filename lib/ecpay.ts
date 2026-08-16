import crypto from "node:crypto";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`尚未設定綠界金流：${name}`);
  return value;
};

export const ecpayConfig = () => ({
  merchantId: required("ECPAY_MERCHANT_ID"),
  hashKey: required("ECPAY_HASH_KEY"),
  hashIv: required("ECPAY_HASH_IV"),
  gateway:
    process.env.ECPAY_ENV === "production"
      ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
      : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
});

const ecpayEncode = (value: string) =>
  encodeURIComponent(value)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");

export function checkMacValue(
  fields: Record<string, string>,
  hashKey: string,
  hashIv: string,
) {
  const content = Object.entries(fields)
    .filter(([key]) => key !== "CheckMacValue")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return crypto
    .createHash("sha256")
    .update(ecpayEncode(`HashKey=${hashKey}&${content}&HashIV=${hashIv}`))
    .digest("hex")
    .toUpperCase();
}

export const compactTradeNo = (bookingNo: string) =>
  bookingNo.replace(/[^A-Za-z0-9]/g, "").slice(0, 20);

export const bookingNoFromTradeNo = (tradeNo: string) => {
  const match = tradeNo.match(/^LAS(\d{8})([A-Za-z0-9]{6})$/);
  return match ? `LAS-${match[1]}-${match[2]}` : "";
};
