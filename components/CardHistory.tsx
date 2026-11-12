'use client';
import { historyLine, type HistoryEvent } from './card-format';

type Props = {
  events: Array<HistoryEvent & { id: string }>;
  nameByEmail: Record<string, string>;
};

export function CardHistory({ events, nameByEmail }: Props) {
  if (events.length === 0) return <p className="text-[13px] text-mt-muted">Sem histórico.</p>;
  return (
    <ol className="space-y-1.5 border-l border-mt-line pl-3">
      {events.map((e) => (
        <li key={e.id} className="text-[12.5px] leading-snug text-mt-text">
          {historyLine(e, nameByEmail)}
        </li>
      ))}
    </ol>
  );
}
