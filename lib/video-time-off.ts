import { parseTaipeiDateTime, taipeiDateKey } from "./taipei-time";
export type VideoTimeOff = { id: string; off_date: string; start_time: string; end_time: string; note: string | null };
const HOUR = 3600000;
export function timeOffWindow(off: Pick<VideoTimeOff, "off_date" | "start_time" | "end_time">) {
  return { start: parseTaipeiDateTime(`${off.off_date}T${off.start_time}`).getTime() - HOUR,
    end: parseTaipeiDateTime(`${off.off_date}T${off.end_time}`).getTime() + HOUR };
}
export function overlapsTimeOff(start: number, end: number, off: VideoTimeOff) {
  const blocked = timeOffWindow(off);
  return start < blocked.end && end > blocked.start;
}
export function validateTimeOff(date: unknown, start: unknown, end: unknown, now = new Date()): string {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "請選擇正確日期";
  const parsed = parseTaipeiDateTime(date);
  if (!Number.isFinite(parsed.getTime()) || taipeiDateKey(parsed) !== date) return "日期不正確";
  if (date < taipeiDateKey(now)) return "休假日期不能早於今天";
  if (typeof start !== "string" || typeof end !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return "請填寫正確的起訖時間";
  if (end <= start) return "結束時間必須晚於開始時間；跨日行程請分成兩筆";
  return "";
}
