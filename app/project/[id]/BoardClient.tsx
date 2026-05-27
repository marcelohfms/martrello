'use client';
import { useState } from 'react';
import { Board, type Column } from '@/components/Board';
// CardPanel will be added in Task 29 — for now just inline a placeholder import comment.

export function BoardClient({ columns }: { columns: Column[] }) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  return (
    <>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="project" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && (
        <div className="fixed top-2 right-2 bg-[var(--color-mt-list)] p-2 rounded text-xs">
          Card panel coming in Task 29. id: {openCardId}{' '}
          <button type="button" onClick={() => setOpenCardId(null)} className="ml-2 underline">x</button>
        </div>
      )}
    </>
  );
}
