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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function findCardColumn(id: string) {
    return cols.find((col) => col.cards.some((c) => c.id === id));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const fromCol = findCardColumn(String(active.id));
    if (!fromCol) return;

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

    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, cards: [...c.cards] }));
      const from = next.find((c) => c.id === fromCol.id)!;
      const to = next.find((c) => c.id === toColId)!;
      const idx = from.cards.findIndex((c) => c.id === active.id);
      const [card] = from.cards.splice(idx, 1);
      const insertAt = beforeCardId
        ? to.cards.findIndex((c) => c.id === beforeCardId)
        : to.cards.length;
      to.cards.splice(insertAt < 0 ? to.cards.length : insertAt, 0, card);
      return next;
    });

    const position = (toCol.cards.findIndex((c) => c.id === beforeCardId) + 1) * 1000;
    if (variant === 'sprint') {
      moveInSprintAction(String(active.id), toColId as 'backlog' | 'doing' | 'done', position);
    } else {
      moveCardAction(String(active.id), toColId, position);
    }
  }

  return (
    <DndContext id={`martrello-${variant}`} sensors={sensors} onDragEnd={onDragEnd}>
      {/*
        board-scroll: custom class in globals.css for smooth horizontal scroll
        + touch scrolling. padding-bottom leaves room for scrollbar.
      */}
      <div
        role="region"
        aria-label="Board de tarefas"
        className="board-scroll flex gap-3 p-4 pb-3 h-full"
        style={{ paddingLeft: 'max(16px, env(safe-area-inset-left))' }}
      >
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
        {/* trailing spacer so last column doesn't cut off on mobile */}
        <div className="w-2 shrink-0" aria-hidden="true" />
      </div>
    </DndContext>
  );
}
