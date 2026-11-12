// lib/core/week.ts — weeks run Monday–Sunday in São Paulo time.
const TIME_ZONE = 'America/Sao_Paulo';
const DAY_MS = 86_400_000;
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
});
const clockFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function parts(f: Intl.DateTimeFormat, ms: number): Record<string, string> {
  return Object.fromEntries(f.formatToParts(ms).map((p) => [p.type, p.value]));
}

/** UTC midnight of a `YYYY-MM-DD`, used for calendar arithmetic only. */
function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoOf(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** How far São Paulo's wall clock is from UTC at `ms` (negative west of Greenwich). */
function offsetAt(ms: number): number {
  const p = parts(clockFormat, ms);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/** The instant of 00:00 in São Paulo on the given date. */
function saoPauloMidnight(iso: string): number {
  const wall = utcDay(iso);
  const guess = wall - offsetAt(wall);
  return wall - offsetAt(guess);
}

/** The Monday (`YYYY-MM-DD`) of the São Paulo week containing `now`. */
export function weekStartISO(now: Date): string {
  const p = parts(dayFormat, now.getTime());
  const today = Date.UTC(+p.year, +p.month - 1, +p.day);
  return isoOf(today - WEEKDAYS.indexOf(p.weekday) * DAY_MS);
}

/** São Paulo midnight of the Monday to the next Monday's (exclusive). */
export function weekBounds(weekStart: string): { startMs: number; endMs: number } {
  return {
    startMs: saoPauloMidnight(weekStart),
    endMs: saoPauloMidnight(isoOf(utcDay(weekStart) + 7 * DAY_MS)),
  };
}

export function sprintName(weekStart: string): string {
  const [, m, d] = weekStart.split('-');
  return `Semana ${d}/${m}`;
}
