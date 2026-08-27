const TAIPEI_TIME_ZONE = "Asia/Taipei";

export function taipeiDateKey(value: Date | string = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: TAIPEI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function addCalendarDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

export function earliestVideoBookingDate(now = new Date()) {
  return addCalendarDays(taipeiDateKey(now), 4);
}

export function isAllowedVideoSlot(slotStart: string, now = new Date()) {
  return taipeiDateKey(slotStart) >= earliestVideoBookingDate(now);
}
