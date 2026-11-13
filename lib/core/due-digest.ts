// lib/core/due-digest.ts — pure builder/renderer for the daily Slack "due tasks" message.
import type { DueCard } from './due-cards';
import { addDaysISO, isoWeekday } from './week';

export type Digest = { overdue: DueCard[]; today: DueCard[]; week: DueCard[] };

const LONG_DAYS = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
const SHORT_DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

function byDueThenPosition(a: DueCard, b: DueCard): number {
  return a.dueDate.localeCompare(b.dueDate) || a.position - b.position;
}

export function buildDigest(cards: DueCard[], today: string, includeWeek: boolean): Digest {
  const sunday = addDaysISO(today, 7 - isoWeekday(today));
  const sorted = [...cards].sort(byDueThenPosition);
  return {
    overdue: sorted.filter((c) => c.dueDate < today),
    today: sorted.filter((c) => c.dueDate === today),
    week: includeWeek ? sorted.filter((c) => c.dueDate > today && c.dueDate <= sunday) : [],
  };
}

export function isEmptyDigest(d: Digest): boolean {
  return d.overdue.length === 0 && d.today.length === 0 && d.week.length === 0;
}

function escapeSlack(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dayMonth(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function shortDay(iso: string): string {
  return `${SHORT_DAYS[isoWeekday(iso) - 1]} ${dayMonth(iso)}`;
}

export function renderDigest(
  d: Digest,
  opts: { projectName: string; today: string; boardUrl: string; slackIdByEmail: Map<string, string> },
): string {
  const who = (c: DueCard): string => {
    const id = c.assigneeEmail ? opts.slackIdByEmail.get(c.assigneeEmail) : undefined;
    if (id) return `<@${id}>`;
    return c.assigneeName ? escapeSlack(c.assigneeName) : 'sem responsável';
  };

  const blocks = [
    `*Prazos de hoje · ${escapeSlack(opts.projectName)}* — ${LONG_DAYS[isoWeekday(opts.today) - 1]}, ${dayMonth(opts.today)}`,
  ];
  const group = (heading: string, cards: DueCard[], line: (c: DueCard) => string) => {
    if (cards.length === 0) return;
    blocks.push([`${heading} (${cards.length})*`, ...cards.map((c) => `• ${line(c)}`)].join('\n'));
  };
  group('🔴 *Atrasadas', d.overdue, (c) => `${escapeSlack(c.title)} — ${who(c)} · venceu ${shortDay(c.dueDate)}`);
  group('🟡 *Vencem hoje', d.today, (c) => `${escapeSlack(c.title)} — ${who(c)}`);
  group('🗓️ *Resto da semana', d.week, (c) => `${shortDay(c.dueDate)} — ${escapeSlack(c.title)} — ${who(c)}`);
  blocks.push(`<${opts.boardUrl}|Abrir quadro>`);
  return blocks.join('\n\n');
}
