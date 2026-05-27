'use client';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCard } from './SortableCard';
import type { CardData } from './Card';
import { QuickCreate } from './QuickCreate';

type Props = {
  id: string;
  title: string;
  cards: CardData[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
  quickCreate?: { projectId: string; listId: string } | null;
};

export function List({ id, title, cards, variant = 'project', onCardClick, quickCreate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const isSprint = variant === 'sprint';
  const listBg = isSprint
    ? 'bg-[var(--color-mt-sprint-list)]'
    : 'bg-[var(--color-mt-list)]';
  const headerColor = isSprint
    ? 'text-[var(--color-mt-sprint-accent)]'
    : 'text-[var(--color-mt-text)]';
  const countColor = isSprint
    ? 'text-[var(--color-mt-sprint-accent)]/60'
    : 'text-[var(--color-mt-muted)]';
  const dropRing = isSprint
    ? 'ring-[var(--color-mt-sprint-accent)]'
    : 'ring-[var(--color-mt-accent)]';

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`Coluna: ${title}`}
      className={`
        ${listBg} rounded-[var(--radius-md)]
        flex flex-col
        w-72 shrink-0
        transition-shadow duration-[180ms]
        ${isOver
          ? `ring-2 ${dropRing} drop-ring shadow-lg`
          : 'ring-1 ring-black/10'
        }
      `}
    >
      {/* Column header */}
      <div className="
        flex items-center justify-between
        px-3 py-2.5
        border-b border-black/10
      ">
        <span className={`
          text-[12px] font-semibold tracking-wide uppercase
          ${headerColor}
        `}>
          {title}
        </span>
        <span className={`mono-badge ${countColor}`}>
          {cards.length}
        </span>
      </div>

      {/* Card list */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5 p-2 min-h-[4px]">
          {cards.map((c) => (
            <SortableCard
              key={c.id}
              card={c}
              variant={variant}
              onClick={() => onCardClick?.(c.id)}
            />
          ))}
          {/* Empty drop zone — keeps column droppable when empty */}
          {cards.length === 0 && (
            <div
              className="
                h-16 rounded-[var(--radius-sm)]
                border border-dashed
                border-black/15
                flex items-center justify-center
              "
              aria-hidden="true"
            >
              <span className="text-[11px] text-[var(--color-mt-muted)]/50 select-none">
                sem cards
              </span>
            </div>
          )}
        </div>
      </SortableContext>

      {/* Quick create */}
      {quickCreate && (
        <div className="px-2 pb-2">
          <QuickCreate projectId={quickCreate.projectId} listId={quickCreate.listId} />
        </div>
      )}
    </div>
  );
}
