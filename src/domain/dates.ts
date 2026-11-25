/**
 * Fast UK-style date text. `toLocaleDateString(…, options)` builds a new formatter on every call,
 * which is slow (noticeably so on older Android phones, where lists format dozens of dates); these
 * produce the same en-GB text with plain arithmetic, in the phone's own time zone.
 */
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number) => String(n).padStart(2, '0');
const short = (s: string) => s.slice(0, 3);

/** 19:05 */
export const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** Wednesday */
export const weekday = (d: Date) => WEEKDAYS[d.getDay()];
/** Wed 12 Nov */
export const dayShort = (d: Date) => `${short(WEEKDAYS[d.getDay()])} ${d.getDate()} ${short(MONTHS[d.getMonth()])}`;
/** Wednesday 12 Nov */
export const dayLongMonthShort = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${short(MONTHS[d.getMonth()])}`;
/** Wednesday 12 November */
export const dayLong = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
/** 12 Nov 2026 */
export const dateShort = (d: Date) => `${d.getDate()} ${short(MONTHS[d.getMonth()])} ${d.getFullYear()}`;
/** 12 Nov */
export const dayMonth = (d: Date) => `${d.getDate()} ${short(MONTHS[d.getMonth()])}`;
/** November 2026 */
export const monthYear = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** The hour (0–23) in UK time, whatever the phone's time zone (one formatter, made once). */
let londonHour: Intl.DateTimeFormat | null = null;
export function ukHour(d: Date): number {
  londonHour ??= new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/London' });
  return Number(londonHour.format(d)) % 24;
}
