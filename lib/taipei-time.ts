export const TAIPEI_TIME_ZONE = "Asia/Taipei";
/** Offset-free date/time inputs are Taiwan wall time; explicit offsets remain instants. */
export function parseTaipeiDateTime(value: string): Date {
  const input = String(value || "").trim();
  const bare = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(input);
  return new Date(bare ? `${input}+08:00` : /^\d{4}-\d{2}-\d{2}$/.test(input) ? `${input}T00:00:00+08:00` : input);
}
export function taipeiDateKey(value: Date | string = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {timeZone: TAIPEI_TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit"}).format(typeof value === "string" ? parseTaipeiDateTime(value) : value);
}
export function taipeiDateTimeInput(value: Date | string): string {
  const date=typeof value==="string"?parseTaipeiDateTime(value):value;
  const time=new Intl.DateTimeFormat("en-GB",{timeZone:TAIPEI_TIME_ZONE,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(date);
  return `${taipeiDateKey(date)}T${time}`;
}
export function taipeiYear(value: Date = new Date()): number { return Number(taipeiDateKey(value).slice(0,4)); }
/** Calendar arithmetic on a date key, independent of device/server timezone. */
export function calendarWeekday(value: string): number { return new Date(`${value}T12:00:00Z`).getUTCDay(); }
