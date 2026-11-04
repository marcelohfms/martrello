'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, type CardData } from './Card';

type Props = { card: CardData; variant?: 'project' | 'sprint'; onClick?: () => void };

export function SortableCard({ card, variant, onClick }: Props) {
  // dnd-kit's `attributes` are left out: they make this wrapper a role="button"
  // around the card's real buttons, and no keyboard sensor uses them.
  const {
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
        // The moving copy lives in Board's DragOverlay; this marks the origin.
        opacity: isDragging ? 0.35 : 1,
      }}
      {...listeners}
    >
      <Card card={card} variant={variant} onClick={onClick} />
    </div>
  );
}
