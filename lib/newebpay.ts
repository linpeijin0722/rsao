import crypto from "node:crypto";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`尚未設定藍新金流：${name}`);
  return value;
};

export const newebpayConfig = () => ({
  merchantId: required("NEWEBPAY_MERCHANT_ID"),
  hashKey: required("NEWEBPAY_HASH_KEY"),
  hashIv: required("NEWEBPAY_HASH_IV"),
  gateway:
    process.env.NEWEBPAY_ENV === "production"
      ? "https://core.newebpay.com/MPG/mpg_gateway"
      : "https://ccore.newebpay.com/MPG/mpg_gateway",
});

export function encryptTradeInfo(plainText: string, key: string, iv: string) {
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]).toString("hex");
}

export function decryptTradeInfo(value: string, key: string, iv: string) {
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  return Buffer.concat([
    decipher.update(Buffer.from(value, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

export function tradeSha(tradeInfo: string, key: string, iv: string) {
  return crypto
    .createHash("sha256")
    .update(`HashKey=${key}&${tradeInfo}&HashIV=${iv}`)
    .digest("hex")
    .toUpperCase();
}
