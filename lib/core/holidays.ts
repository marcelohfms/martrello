// lib/core/holidays.ts — Brazilian national holidays and business days.
import { addDaysISO, isoWeekday } from './week';

const pad = (n: number) => String(n).padStart(2, '0');

/** Easter Sunday (`YYYY-MM-DD`), Gregorian computus (Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const FIXED = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'];

/** National holidays of `year`: fixed dates plus Carnival (Mon/Tue), Good Friday and Corpus Christi. */
export function nationalHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const movable = [-48, -47, -2, 60].map((n) => addDaysISO(easter, n));
  return new Set([...FIXED.map((md) => `${year}-${md}`), ...movable]);
}

export function isBusinessDay(iso: string): boolean {
  return isoWeekday(iso) <= 5 && !nationalHolidays(+iso.slice(0, 4)).has(iso);
}

/** `iso` is a business day and no business day precedes it since that week's Monday. */
export function isFirstBusinessDayOfWeek(iso: string): boolean {
  if (!isBusinessDay(iso)) return false;
  for (let d = addDaysISO(iso, -1), n = isoWeekday(iso) - 1; n > 0; d = addDaysISO(d, -1), n--) {
    if (isBusinessDay(d)) return false;
  }
  return true;
}
