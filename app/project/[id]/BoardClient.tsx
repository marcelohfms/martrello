'use client';
import { useState } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { useAutoRefresh } from '@/components/useAutoRefresh';

export function BoardClient({ columns }: { columns: Column[] }) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  useAutoRefresh(3000);
  return (
    <>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="project" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && (
        <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </>
  );
}
