'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, type CardData } from './Card';

type Props = { card: CardData; variant?: 'project' | 'sprint'; onClick?: () => void };

export function SortableCard({ card, variant, onClick }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.35 : 1,
        // subtle scale while dragging ghost
        scale: isDragging ? '1.02' : undefined,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <Card card={card} variant={variant} onClick={onClick} />
    </div>
  );
}
