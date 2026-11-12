'use client';
import { useState } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { useRealtimeRefresh } from '@/components/useRealtimeRefresh';

type Props = { columns: Column[]; sprintName: string | null; weekDay: number };

function SprintProgress({ done, doing, total }: { done: number; doing: number; total: number }) {
  return (
    <div className="hidden items-center gap-2.5 md:flex">
      <div
        role="img"
        aria-label={`${done} de ${total} cards feitos, ${doing} em andamento`}
        className="flex h-1.5 w-36 overflow-hidden rounded-full bg-mt-rail-line"
      >
        <span className="bg-ax-green-400" style={{ width: `${(done / total) * 100}%` }} />
        <span className="bg-ax-greige-400" style={{ width: `${(doing / total) * 100}%` }} />
      </div>
      <span className="text-[13px] font-medium text-mt-rail-text">
        {done} de {total} feitos
      </span>
    </div>
  );
}

export function SprintClient({ columns, sprintName, weekDay }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  useRealtimeRefresh();

  const totalCards = columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards = columns.find((c) => c.id === 'done')?.cards.length ?? 0;
  const doingCards = columns.find((c) => c.id === 'doing')?.cards.length ?? 0;

  return (
    <>
      {/* Sprint band: the rail wraps across the header. Mobile keeps room for the hamburger. */}
      <header className="on-rail flex h-14 shrink-0 items-center gap-3 bg-mt-rail pl-16 pr-4 md:pl-6 md:pr-6">
        <h1 className="truncate text-[18px] font-bold tracking-[-0.02em] text-mt-rail-strong">
          {sprintName ?? 'Sprint'}
        </h1>

        <span className="shrink-0 text-[13px] font-medium text-mt-rail-text">
          <span aria-hidden="true" className="text-mt-rail-muted">//</span> Dia {weekDay}
        </span>

        {totalCards > 0 && <SprintProgress done={doneCards} doing={doingCards} total={totalCards} />}
      </header>

      {totalCards === 0 && (
        <p className="shrink-0 border-b border-mt-line bg-mt-card px-4 py-2 text-[13px] text-mt-muted md:px-6">
          Nenhuma tarefa sua em A fazer, Fazendo ou Feito nesta semana.
        </p>
      )}

      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="sprint" onCardClick={(id) => setOpenCardId(id)} />
      </div>

      {openCardId && (
        <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </>
  );
}
