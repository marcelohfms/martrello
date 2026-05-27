'use client';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type CardData = {
  id: string;
  title: string;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  projectName?: string;
  projectColor?: string;
};

type Props = {
  card: CardData;
  variant?: 'project' | 'sprint';
  onClick?: () => void;
};

export function Card({ card, variant = 'project', onClick }: Props) {
  const accent = card.labels[0]?.color;
  const bg = variant === 'sprint' ? 'bg-[var(--color-mt-sprint-card)]' : 'bg-[var(--color-mt-card)]';
  const isOverdue = card.dueDate && parseISO(card.dueDate) < new Date();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left ${bg} rounded p-2.5 text-xs leading-snug shadow-sm border-l-[3px] hover:brightness-110 transition`}
      style={{ borderLeftColor: accent ?? 'transparent' }}
    >
      <div className="text-[var(--color-mt-text)]">{card.title}</div>
      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-[var(--color-mt-muted)]">
        {card.dueDate && (
          <span className={isOverdue ? 'text-rose-400' : ''}>
            📅 {format(parseISO(card.dueDate), 'dd MMM', { locale: ptBR })}
          </span>
        )}
        {card.labels.map((l) => (
          <span key={l.name} className="inline-flex items-center gap-1">
            <span className="w-5 h-1.5 rounded-sm" style={{ background: l.color }} />
            {l.name}
          </span>
        ))}
        {variant === 'sprint' && card.projectName && (
          <span
            className="ml-auto px-2 py-0.5 rounded-full bg-[var(--color-mt-sprint-bg)]"
            style={{ color: card.projectColor }}
          >
            {card.projectName}
          </span>
        )}
      </div>
    </button>
  );
}
