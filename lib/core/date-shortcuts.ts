import { addDays, addMonths, format, getDate, lastDayOfMonth, setDate } from 'date-fns';

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): string {
  return fmt(now);
}

export function tomorrowISO(now: Date = new Date()): string {
  return fmt(addDays(now, 1));
}

export function nextWeekISO(now: Date = new Date()): string {
  return fmt(addDays(now, 7));
}

export function nextMonthISO(now: Date = new Date()): string {
  const target = addMonths(now, 1);
  const lastDay = getDate(lastDayOfMonth(target));
  const clampedDay = Math.min(getDate(now), lastDay);
  return fmt(setDate(target, clampedDay));
}
