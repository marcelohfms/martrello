'use client';
import { useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { List } from './List';
import type { CardData } from './Card';
import { moveCardAction, moveInSprintAction } from '@/app/actions';

export type Column = {
  id: string;
  title: string;
  cards: CardData[];
  quickCreate?: { projectId: string; listId: string };
};

type Props = {
  columns: Column[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
};

export function Board({ columns, variant = 'project', onCardClick }: Props) {
  const [cols, setCols] = useState(columns);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function findCardColumn(id: string) {
    return cols.find((col) => col.cards.some((c) => c.id === id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const fromCol = findCardColumn(String(active.id));
    if (!fromCol) return;

    // dropping onto a column id (empty area) or another card (id in cards)
    let toColId: string | null = null;
    let beforeCardId: string | null = null;
    const overId = String(over.id);
    if (cols.some((c) => c.id === overId)) {
      toColId = overId;
    } else {
      const toCol = findCardColumn(overId);
      if (toCol) {
        toColId = toCol.id;
        beforeCardId = overId;
      }
    }
    if (!toColId) return;

    const toCol = cols.find((c) => c.id === toColId)!;
    // optimistic reorder
    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, cards: [...c.cards] }));
      const from = next.find((c) => c.id === fromCol.id)!;
      const to = next.find((c) => c.id === toColId)!;
      const idx = from.cards.findIndex((c) => c.id === active.id);
      const [card] = from.cards.splice(idx, 1);
      const insertAt = beforeCardId ? to.cards.findIndex((c) => c.id === beforeCardId) : to.cards.length;
      to.cards.splice(insertAt < 0 ? to.cards.length : insertAt, 0, card);
      return next;
    });

    // persist
    const position = (toCol.cards.findIndex((c) => c.id === beforeCardId) + 1) * 1000;
    if (variant === 'sprint') {
      moveInSprintAction(String(active.id), toColId as 'backlog' | 'doing' | 'done', position);
    } else {
      moveCardAction(String(active.id), toColId, position);
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex gap-3 p-4 overflow-x-auto h-full">
        {cols.map((c) => (
          <List
            key={c.id}
            id={c.id}
            title={c.title}
            cards={c.cards}
            variant={variant}
            onCardClick={onCardClick}
            quickCreate={c.quickCreate ?? null}
          />
        ))}
      </div>
    </DndContext>
  );
}
