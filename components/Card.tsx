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

// SVG calendar icon — no emoji
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 5h10" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 1v2M8 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ card, variant = 'project', onClick }: Props) {
  const primaryLabel = card.labels[0];
  const accent = primaryLabel?.color;
  const isSprint = variant === 'sprint';

  const bg = isSprint
    ? 'bg-[var(--color-mt-sprint-card)] hover:bg-[var(--color-mt-sprint-card-hover)]'
    : 'bg-[var(--color-mt-card)] hover:bg-[var(--color-mt-card-hover)]';

  const isOverdue = card.dueDate ? parseISO(card.dueDate) < new Date() : false;

  const dueDateFormatted = card.dueDate
    ? format(parseISO(card.dueDate), 'dd MMM', { locale: ptBR })
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Card: ${card.title}${card.dueDate ? `. Prazo: ${dueDateFormatted}` : ''}`}
      className={`
        card-btn
        w-full text-left rounded-[var(--radius-sm)]
        ${bg}
        px-2.5 py-2
        border-l-[3px]
        shadow-sm
        transition-colors duration-[120ms]
        cursor-pointer
        focus-visible:outline-2
        focus-visible:outline-[var(--color-mt-accent)]
        focus-visible:outline-offset-1
        focus-visible:rounded-[var(--radius-sm)]
        group
      `}
      style={{ borderLeftColor: accent ?? 'transparent' }}
    >
      {/* Title */}
      <p className="
        text-[13px] leading-snug
        text-[var(--color-mt-text)]
        font-medium
        group-hover:text-white
        transition-colors duration-[120ms]
        break-words
      ">
        {card.title}
      </p>

      {/* Meta row */}
      {(card.dueDate || card.labels.length > 0 || (isSprint && card.projectName)) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-2">
          {/* Due date */}
          {card.dueDate && (
            <span className={`
              flex items-center gap-1
              text-[11px] font-medium mono-badge
              ${isOverdue
                ? 'text-[var(--color-mt-danger)]'
                : 'text-[var(--color-mt-muted-hi)]'
              }
            `}>
              <CalendarIcon className={isOverdue ? 'text-[var(--color-mt-danger)]' : undefined} />
              {dueDateFormatted}
              {isOverdue && <span className="sr-only">(atrasado)</span>}
            </span>
          )}

          {/* Labels */}
          {card.labels.map((l) => (
            <span
              key={l.name}
              className="flex items-center gap-1 text-[11px] text-[var(--color-mt-muted-hi)]"
            >
              <span
                className="w-6 h-1 rounded-sm shrink-0"
                style={{ background: l.color }}
                aria-hidden="true"
              />
              <span className="truncate max-w-[80px]">{l.name}</span>
            </span>
          ))}

          {/* Sprint: project pill */}
          {isSprint && card.projectName && (
            <span
              className="
                ml-auto mono-badge
                px-1.5 py-0.5 rounded-[3px]
                bg-black/20
                font-medium truncate max-w-[100px]
              "
              style={{ color: card.projectColor ?? 'var(--color-mt-muted-hi)' }}
              title={card.projectName}
            >
              {card.projectName}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
