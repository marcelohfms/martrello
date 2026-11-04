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

  return (
    <div
      ref={setNodeRef}
      role="region"
      aria-label={`Coluna: ${title}`}
      className={`
        flex w-72 shrink-0 flex-col min-h-0
        ${variant === 'sprint' ? 'md:max-w-md md:flex-[1_0_18rem]' : ''}
        rounded-[var(--radius-lg)] bg-mt-list
        transition-shadow duration-[var(--duration-fast)] ease-out
        ${isOver ? 'ring-2 ring-mt-accent' : ''}
      `}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-1.5 pt-3">
        <span className="label-caps truncate text-mt-heading">{title}</span>
        <span className="text-[12px] font-semibold text-mt-muted">{cards.length}</span>
      </div>

      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
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
            <div className="flex h-16 shrink-0 select-none items-center justify-center rounded-[var(--radius-md)] border border-dashed border-mt-line-strong text-[12px] text-mt-muted">
              Sem cards
            </div>
          )}
        </div>
      </SortableContext>

      {quickCreate && (
        <div className="px-2 pb-2">
          <QuickCreate projectId={quickCreate.projectId} listId={quickCreate.listId} />
        </div>
      )}
    </div>
  );
}
