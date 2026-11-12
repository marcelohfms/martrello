import { format } from 'date-fns';
import type { CardEventType } from '@/lib/core/events';

/** First letter of the first and last word, uppercase; a single word gives its first two letters. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** dd/MM, local time, for the "Concluída em" line. */
export function formatDay(ms: number): string {
  return format(new Date(ms), 'dd/MM');
}

/** dd/MM HH:mm, local time. */
export function formatEventTime(ms: number): string {
  return format(new Date(ms), 'dd/MM HH:mm');
}

export type HistoryEvent = {
  type: CardEventType;
  from: string | null;
  to: string | null;
  at: number;
  actorName: string | null;
};

function describe(e: HistoryEvent, nameByEmail: Record<string, string>): string {
  const who = (v: string | null) => (v ? nameByEmail[v] ?? v : 'ninguém');
  switch (e.type) {
    case 'created': return `criou em ${e.to}`;
    case 'stage': return `moveu de ${e.from} para ${e.to}`;
    case 'assignee': return `responsável: ${who(e.from)} → ${who(e.to)}`;
    case 'due_date': return `prazo: ${e.from ?? '—'} → ${e.to ?? '—'}`;
    case 'title': return `renomeou para ${e.to}`;
    case 'description': return 'editou a descrição';
    case 'label_added': return `adicionou a label ${e.to}`;
    case 'label_removed': return `removeu a label ${e.from}`;
    case 'dependency_added': return 'adicionou dependência';
    case 'dependency_removed': return 'removeu dependência';
    case 'project': return 'moveu para outro projeto';
    case 'archived': return 'arquivou';
    case 'unarchived': return 'desarquivou';
    case 'migrated': return 'migração para o modelo com responsáveis';
  }
}

/** "{autor} · {o que mudou} · dd/MM HH:mm". Assignee emails become names when `nameByEmail` knows them. */
export function historyLine(e: HistoryEvent, nameByEmail: Record<string, string> = {}): string {
  return `${e.actorName ?? 'Sistema'} · ${describe(e, nameByEmail)} · ${formatEventTime(e.at)}`;
}
