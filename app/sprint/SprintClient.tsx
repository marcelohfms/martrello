'use client';
import { useState, useTransition } from 'react';
import { Board, type Column } from '@/components/Board';
import { CardPanel } from '@/components/CardPanel';
import { closeSprintAction } from '@/app/actions';
import { useAutoRefresh } from '@/components/useAutoRefresh';

type Props = { columns: Column[]; sprintName: string; startedDays: number };

export function SprintClient({ columns, sprintName, startedDays }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  useAutoRefresh(3000);

  const totalCards = columns.reduce((sum, c) => sum + c.cards.length, 0);
  const doneCards  = columns.find((c) => c.id === 'done')?.cards.length ?? 0;

  return (
    <>
      {/* Sprint header */}
      <header className="
        flex items-center gap-3 px-4 py-2.5 shrink-0
        border-b border-[var(--color-mt-sprint-line-subtle,var(--color-mt-sprint-line))]
        /* mobile: leave room for hamburger */
        pl-14 md:pl-4
      ">
        {/* Sprint indicator */}
        <span
          className="w-2 h-2 rounded-full bg-[var(--color-mt-sprint-accent)] shrink-0 animate-pulse"
          aria-hidden="true"
        />

        {/* Sprint name */}
        <h1 className="text-[14px] font-semibold text-[var(--color-mt-text)] truncate">
          {sprintName}
        </h1>

        {/* Day badge */}
        <span className="
          mono-badge shrink-0
          px-1.5 py-0.5 rounded-[3px]
          bg-[var(--color-mt-sprint-accent)]/10
          text-[var(--color-mt-sprint-accent)]
          hidden sm:inline-flex
        ">
          dia {startedDays}
        </span>

        {/* Progress */}
        {totalCards > 0 && (
          <span className="
            mono-badge text-[var(--color-mt-muted)] hidden md:inline
          ">
            {doneCards}/{totalCards}
          </span>
        )}

        {/* Close sprint control */}
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await closeSprintAction(true);
                    setConfirming(false);
                  })
                }
                className="
                  text-[12px] font-medium
                  px-2.5 py-1 rounded-[var(--radius-sm)]
                  bg-[var(--color-mt-sprint-accent)] text-white
                  disabled:opacity-50
                  hover:bg-[var(--color-mt-sprint-accent-hi)]
                  active:scale-95
                  transition-all duration-[120ms]
                  cursor-pointer
                "
              >
                {pending ? 'fechando…' : 'Fechar e carregar'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="
                  text-[12px] px-2 py-1
                  text-[var(--color-mt-muted)]
                  hover:text-[var(--color-mt-text)]
                  rounded-[var(--radius-sm)]
                  transition-colors duration-[120ms]
                  cursor-pointer
                "
              >
                cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="
                text-[12px]
                text-[var(--color-mt-muted)]
                hover:text-[var(--color-mt-danger)]
                px-2 py-1
                rounded-[var(--radius-sm)]
                transition-colors duration-[180ms]
                cursor-pointer
              "
            >
              Fechar sprint
            </button>
          )}
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 min-h-0">
        <Board columns={columns} variant="sprint" onCardClick={(id) => setOpenCardId(id)} />
      </div>

      {/* Card panel */}
      {openCardId && (
        <CardPanel cardId={openCardId} onClose={() => setOpenCardId(null)} />
      )}
    </>
  );
}
