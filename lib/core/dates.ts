import { addDays, addWeeks, format, nextDay, parseISO, isValid, type Day } from 'date-fns';
import { MartrelloError } from '@/lib/errors';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_MAP: Record<string, Day> = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1,
  terça: 2, terca: 2, ter: 2,
  quarta: 3, qua: 3,
  quinta: 4, qui: 4,
  sexta: 5, sex: 5,
  sábado: 6, sabado: 6, sab: 6,
};

function normalize(input: string): string {
  return input.trim().toLowerCase();
}

function fmt(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export function parseDate(input: string, now: Date = new Date()): string {
  const s = normalize(input);

  if (ISO.test(s)) {
    const d = parseISO(s);
    if (!isValid(d)) throw new MartrelloError('INVALID_DATE', `Data ISO inválida: ${input}`);
    return s;
  }

  if (s === 'hoje') return fmt(now);
  if (s === 'amanhã' || s === 'amanha') return fmt(addDays(now, 1));
  if (s === 'ontem') return fmt(addDays(now, -1));

  const weekday = WEEKDAY_MAP[s];
  if (weekday !== undefined) return fmt(nextDay(now, weekday));

  const proximaMatch = s.match(/^pr[oó]xima\s+(\w+)$/);
  if (proximaMatch) {
    const wd = WEEKDAY_MAP[proximaMatch[1]];
    if (wd !== undefined) return fmt(addWeeks(nextDay(now, wd), 1));
  }

  const offsetMatch = s.match(/^\+(\d+)(d|s|sem|semanas?)$/);
  if (offsetMatch) {
    const n = parseInt(offsetMatch[1], 10);
    const unit = offsetMatch[2];
    if (unit === 'd') return fmt(addDays(now, n));
    return fmt(addWeeks(now, n));
  }

  const daquiMatch = s.match(/^daqui\s+(\d+)\s+(dias?|semanas?)$/);
  if (daquiMatch) {
    const n = parseInt(daquiMatch[1], 10);
    return fmt(daquiMatch[2].startsWith('dia') ? addDays(now, n) : addWeeks(now, n));
  }

  throw new MartrelloError('INVALID_DATE', `Não consegui parsear data: ${input}`);
}
