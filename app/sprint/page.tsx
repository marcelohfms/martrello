import { getDb } from '@/lib/db/client';
import { getActiveSprint } from '@/lib/core/sprint';
import { SprintClient } from './SprintClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function SprintPage() {
  const sprint = await getActiveSprint(getDb());

  if (!sprint) {
    return (
      <div className="
        h-dvh flex items-center justify-center
        bg-[var(--color-mt-sprint-bg)]
        pl-14 md:pl-0
      ">
        <div className="text-center space-y-3 px-6">
          <div className="
            w-10 h-10 mx-auto rounded-full
            bg-[var(--color-mt-sprint-accent)]/10
            flex items-center justify-center
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"
                stroke="var(--color-mt-sprint-accent)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-[14px] text-[var(--color-mt-muted)]">Nenhuma sprint ativa.</p>
          <p className="text-[13px] text-[var(--color-mt-muted)]">
            Peça pro Claude:{' '}
            <span className="
              font-mono text-[12px] px-1.5 py-0.5 rounded
              bg-[var(--color-mt-sprint-list)]
              text-[var(--color-mt-text)]
            ">
              inicia uma sprint
            </span>
          </p>
        </div>
      </div>
    );
  }

  const groups: Record<'backlog' | 'doing' | 'done', CardData[]> = {
    backlog: [],
    doing: [],
    done: [],
  };

  for (const c of sprint.cards) {
    groups[c.sprintList].push({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: c.labels,
      projectName: c.projectName,
      projectColor: c.projectColor,
    });
  }

  const columns: Column[] = [
    { id: 'backlog', title: 'Backlog', cards: groups.backlog },
    { id: 'doing',   title: 'Fazendo', cards: groups.doing },
    { id: 'done',    title: 'Feito',   cards: groups.done },
  ];

  const startedDays = Math.floor((Date.now() - sprint.startedAt) / 86_400_000) + 1;

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-mt-sprint-bg)]">
      <SprintClient
        columns={columns}
        sprintName={sprint.name ?? 'Sprint'}
        startedDays={startedDays}
      />
    </div>
  );
}
