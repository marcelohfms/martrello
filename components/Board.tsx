'use client';
import { useEffect, useState } from 'react';
import { DndContext, DragOverlay, type DragEndEvent, type DragStartEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { List } from './List';
import { Card, type CardData } from './Card';
import { moveCardAction } from '@/app/actions';

export type Column = {
  id: string;
  title: string;
  cards: CardData[];
  /** Feito is ordered by completion date, so its cards cannot be reordered by hand. */
  ordered?: boolean;
  quickCreate?: { projectId: string; listId: string };
};

type Props = {
  columns: Column[];
  variant?: 'project' | 'sprint';
  onCardClick?: (id: string) => void;
};

export function Board({ columns, variant = 'project', onCardClick }: Props) {
  const [cols, setCols] = useState(columns);
  const [draggingCard, setDraggingCard] = useState<CardData | null>(null);
  useEffect(() => {
    setCols(columns);
  }, [columns]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function findCardColumn(id: string) {
    return cols.find((col) => col.cards.some((c) => c.id === id));
  }

  function onDragStart(e: DragStartEvent) {
    const col = findCardColumn(String(e.active.id));
    setDraggingCard(col?.cards.find((c) => c.id === e.active.id) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggingCard(null);
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
    // The sprint orders each stage by deadline, so only a change of stage means anything there.
    if (variant === 'sprint' && toColId === fromCol.id) return;

    const toCol = cols.find((c) => c.id === toColId)!;
    // Feito is ordered by completion date: no manual reordering inside it.
    if (toCol.ordered && toCol.id === fromCol.id) return;

    setCols((prev) => {
      const next = prev.map((c) => ({ ...c, cards: [...c.cards] }));
      const from = next.find((c) => c.id === fromCol.id)!;
      const to = next.find((c) => c.id === toColId)!;
      const idx = from.cards.findIndex((c) => c.id === active.id);
      const [card] = from.cards.splice(idx, 1);
      // A card entering Feito was just completed, so it goes on top.
      const insertAt = to.ordered
        ? 0
        : beforeCardId
        ? to.cards.findIndex((c) => c.id === beforeCardId)
        : to.cards.length;
      to.cards.splice(insertAt < 0 ? to.cards.length : insertAt, 0, card);
      return next;
    });

    if (variant === 'sprint') {
      // Sprint columns are stage keys (todo/doing/done): the card moves to that stage's list
      // in its own project.
      moveCardAction(String(active.id), toColId);
    } else if (toCol.ordered) {
      moveCardAction(String(active.id), toColId);
    } else {
      const position = (toCol.cards.findIndex((c) => c.id === beforeCardId) + 1) * 1000;
      moveCardAction(String(active.id), toColId, position);
    }
  }

  return (
    <DndContext
      id={`martrello-${variant}`}
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingCard(null)}
    >
      {/*
        board-scroll: custom class in globals.css for smooth horizontal scroll
        + touch scrolling. padding-bottom leaves room for scrollbar.
      */}
      <div
        role="region"
        aria-label="Board de tarefas"
        className="board-scroll flex gap-3 p-4 pb-3 h-full md:px-6"
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
      {/* Columns scroll on their own, so the moving card must render outside them. */}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {draggingCard ? <Card card={draggingCard} variant={variant} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}
