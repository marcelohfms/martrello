'use client';
import { useState, useTransition } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { closeSprintAction } from '@/app/actions';

type Props = { columns: Column[]; sprintName: string; startedDays: number };

export function SprintClient({ columns, sprintName, startedDays }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <header className="px-4 py-3 border-b border-[var(--color-mt-sprint-line)] flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-mt-sprint-accent)]" />
        <h1 className="text-sm font-semibold">{sprintName}</h1>
        <span className="text-xs text-[var(--color-mt-muted)]">· dia {startedDays}</span>
        <div className="ml-auto">
          {confirming ? (
            <div className="flex gap-2 text-xs">
              <button type="button" disabled={pending} onClick={() => start(async () => { await closeSprintAction(true); setConfirming(false); })} className="bg-[var(--color-mt-sprint-accent)] px-2 py-1 rounded">
                Fechar e carregar
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-[var(--color-mt-muted)] px-2 py-1">cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-xs text-[var(--color-mt-muted)] hover:text-[var(--color-mt-text)]">
              Fechar sprint
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="sprint" onCardClick={(id) => setOpenCardId(id)} />
      </div>
      {openCardId && <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />}
    </>
  );
}
