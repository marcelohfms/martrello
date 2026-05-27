'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, type CardData } from './Card';

type Props = { card: CardData; variant?: 'project' | 'sprint'; onClick?: () => void };

export function SortableCard({ card, variant, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      <Card card={card} variant={variant} onClick={onClick} />
    </div>
  );
}
