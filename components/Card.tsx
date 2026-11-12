'use client';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarDays, CheckCircle2, Lock } from 'lucide-react';
import { formatDay, initials } from './card-format';
import { ProjectTag } from './ProjectTag';
import { useProjectPrivacy } from './ProjectPrivacyContext';

export type CardData = {
  id: string;
  title: string;
  dueDate: string | null;
  labels: Array<{ name: string; color: string }>;
  projectName?: string;
  projectAcronym?: string;
  projectColor?: string;
  isBlocked: boolean;
  assignee: { name: string } | null;
  completedAt: number | null;
};

type Props = {
  card: CardData;
  variant?: 'project' | 'sprint';
  onClick?: () => void;
  /** Rendered in the drag overlay, lifted off the column. */
  lifted?: boolean;
};

export function Card({ card, variant = 'project', onClick, lifted = false }: Props) {
  const { revealed } = useProjectPrivacy();
  const showProjectTag = variant === 'sprint' && Boolean(card.projectAcronym);

  const isOverdue = card.dueDate ? parseISO(card.dueDate) < new Date() : false;
  const dueDateFormatted = card.dueDate
    ? format(parseISO(card.dueDate), 'dd MMM', { locale: ptBR })
    : null;
  const completedOn = card.completedAt != null ? formatDay(card.completedAt) : null;
  const hasMeta = card.isBlocked || card.dueDate || card.labels.length > 0 || completedOn;

  const ariaLabel = [
    `Card: ${card.title}`,
    showProjectTag ? `Projeto: ${card.projectAcronym}` : null,
    card.isBlocked ? 'Bloqueado' : null,
    card.assignee ? `Responsável: ${card.assignee.name}` : null,
    completedOn ? `Concluída em ${completedOn}` : null,
    dueDateFormatted ? `Prazo: ${dueDateFormatted}${isOverdue ? ' (atrasado)' : ''}` : null,
  ].filter(Boolean).join('. ');

  return (
    <div
      className={`
        relative rounded-[var(--radius-md)] border bg-mt-card
        transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-out
        ${lifted
          ? 'border-mt-line-strong shadow-raised'
          : 'border-mt-line shadow-card hover:border-mt-line-strong'
        }
      `}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className={`
          flex w-full cursor-pointer flex-col gap-2 rounded-[var(--radius-md)] px-3 py-2.5 text-left
        `}
      >
        <div className="flex items-start gap-2">
          {showProjectTag && (
            <ProjectTag
              acronym={card.projectAcronym!}
              color={card.projectColor}
              name={revealed ? card.projectName : undefined}
            />
          )}
          <p className="min-w-0 text-[13.5px] font-semibold leading-snug text-mt-heading break-words">
            {card.title}
          </p>
          {card.assignee && (
            <span
              title={card.assignee.name}
              className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-ax-green-950 text-[10.5px] font-bold tracking-[0.02em] text-ax-greige-400"
            >
              {initials(card.assignee.name)}
            </span>
          )}
        </div>

        {hasMeta && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] font-medium">
            {card.isBlocked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-mt-warning-soft px-2 py-0.5 text-mt-warning">
                <Lock size={11} strokeWidth={2} aria-hidden="true" />
                Bloqueado
              </span>
            )}

            {completedOn && (
              <span className="inline-flex items-center gap-1 text-mt-muted">
                <CheckCircle2 size={12} strokeWidth={2} aria-hidden="true" />
                Concluída em {completedOn}
              </span>
            )}

            {card.dueDate && (
              <span className={`inline-flex items-center gap-1 ${isOverdue ? 'font-semibold text-mt-danger' : 'text-mt-muted'}`}>
                <CalendarDays size={12} strokeWidth={2} aria-hidden="true" />
                {dueDateFormatted}
              </span>
            )}

            {card.labels.map((l) => (
              <span key={l.name} className="inline-flex min-w-0 items-center gap-1.5 text-mt-muted">
                <span className="size-2 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                <span className="max-w-[100px] truncate">{l.name}</span>
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}
