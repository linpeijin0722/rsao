const animals = ["鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"];
const stems = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const branches = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function lunarNumber(raw: string) {
  const numeric = raw.match(/\d+/)?.[0];
  if (numeric) return Number(numeric);
  if (raw.includes("正")) return 1;
  if (raw.includes("冬")) return 11;
  if (/[臘腊]/.test(raw)) return 12;
  const value = raw.replace(/[^一二三四五六七八九十廿卅]/g, "");
  if (value.includes("卅")) return 30 + (digits[value.at(-1) || ""] || 0);
  if (value.includes("廿")) return 20 + (digits[value.at(-1) || ""] || 0);
  if (value.includes("十")) { const [a, b] = value.split("十"); return (digits[a] || 1) * 10 + (digits[b] || 0); }
  return digits[value] || 0;
}
export function lunarProfile(dateValue: string) {
  if (!dateValue) return { lunar_birth_text: "", zodiac: "" };
  const date = new Date(`${dateValue}T12:00:00+08:00`), formatter = new Intl.DateTimeFormat("zh-TW-u-ca-chinese", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Taipei" }), parts = formatter.formatToParts(date), year = Number(parts.find((p: any) => p.type === "relatedYear")?.value || dateValue.slice(0, 4)), month = lunarNumber(parts.find((p: any) => p.type === "month")?.value || ""), day = lunarNumber(parts.find((p: any) => p.type === "day")?.value || ""), cycle = year - 4;
  return { lunar_birth_text: `民國${year - 1911}${stems[cycle % 10]}${branches[cycle % 12]}年 ${String(month).padStart(2, "0")}月${String(day).padStart(2, "0")}日`, zodiac: animals[cycle % 12] };
}
