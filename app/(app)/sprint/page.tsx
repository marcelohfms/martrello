import { Zap } from 'lucide-react';
import { getDb } from '@/lib/db/client';
import { getActiveSprint } from '@/lib/core/sprint';
import { SprintClient } from './SprintClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function SprintPage() {
  const sprint = await getActiveSprint(getDb());

  if (!sprint) {
    return (
      <div className="flex h-dvh items-center justify-center bg-mt-bg px-6">
        <div className="space-y-2 text-center">
          <Zap size={22} strokeWidth={1.75} className="mx-auto text-mt-accent" aria-hidden="true" />
          <h1 className="text-[18px] font-bold tracking-[-0.02em] text-mt-heading">Nenhuma sprint ativa</h1>
          <p className="text-[13px] text-mt-muted">
            Peça pro Claude:{' '}
            <span className="rounded-[var(--radius-sm)] bg-mt-list px-1.5 py-0.5 font-medium text-mt-text">
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
      projectAcronym: c.projectAcronym,
      projectColor: c.projectColor,
      isBlocked: c.isBlocked,
      inSprint: true,
    });
  }

  const columns: Column[] = [
    { id: 'backlog', title: 'Backlog', cards: groups.backlog },
    { id: 'doing',   title: 'Fazendo', cards: groups.doing },
    { id: 'done',    title: 'Feito',   cards: groups.done },
  ];

  const startedDays = Math.floor((Date.now() - sprint.startedAt) / 86_400_000) + 1;

  return (
    <div className="h-dvh flex flex-col bg-mt-bg">
      <SprintClient
        columns={columns}
        sprintName={sprint.name}
        startedDays={startedDays}
      />
    </div>
  );
}
