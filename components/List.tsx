'use client';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableCard } from './SortableCard';
import type { CardData } from './Card';
import { QuickCreate } from './QuickCreate';

type Props = {
  id: string;            // logical list id ("backlog"/"doing"/"done" for sprint)
  title: string;
  cards: CardData[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
  quickCreate?: { projectId: string; listId: string } | null;
};

export function List({ id, title, cards, variant = 'project', onCardClick, quickCreate }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const bg = variant === 'sprint' ? 'bg-[var(--color-mt-sprint-list)]' : 'bg-[var(--color-mt-list)]';

  return (
    <div
      ref={setNodeRef}
      className={`${bg} rounded p-2 flex flex-col gap-2 w-72 shrink-0 ${isOver ? 'ring-2 ring-[var(--color-mt-accent)]' : ''}`}
    >
      <div className="text-xs font-semibold px-1 text-[var(--color-mt-text)]/85">{title}</div>
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-1">
          {cards.map((c) => (
            <SortableCard key={c.id} card={c} variant={variant} onClick={() => onCardClick?.(c.id)} />
          ))}
        </div>
      </SortableContext>
      {quickCreate && <QuickCreate projectId={quickCreate.projectId} listId={quickCreate.listId} />}
    </div>
  );
}
