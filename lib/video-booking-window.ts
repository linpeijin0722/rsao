import { parseTaipeiDateTime } from "@/lib/taipei-time";
const TAIPEI_TIME_ZONE = "Asia/Taipei";

export function taipeiDateKey(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? parseTaipeiDateTime(value) : value);
}

export function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export const DEFAULT_VIDEO_LEAD_DAYS = 3;
export function validVideoLeadDays(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 36500;
}

export function earliestVideoBookingDate(now = new Date(), leadDays = DEFAULT_VIDEO_LEAD_DAYS) {
  return addCalendarDays(taipeiDateKey(now), leadDays + 1);
}

export function videoBookingDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00+08:00`);
  return `${Number(dateKey.slice(5, 7))}/${Number(dateKey.slice(8, 10))}(${new Intl.DateTimeFormat("zh-TW", { timeZone: TAIPEI_TIME_ZONE, weekday: "narrow" }).format(date)})`;
}

export function isAllowedVideoSlot(slotStart: string, now = new Date(), leadDays = DEFAULT_VIDEO_LEAD_DAYS) {
  return taipeiDateKey(slotStart) >= earliestVideoBookingDate(now, leadDays);
}
