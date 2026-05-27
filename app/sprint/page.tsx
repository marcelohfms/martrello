import { getDb } from '@/lib/db/client';
import { getActiveSprint } from '@/lib/core/sprint';
import { SprintClient } from './SprintClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function SprintPage() {
  const sprint = await getActiveSprint(getDb());

  if (!sprint) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-[var(--color-mt-muted)]">
        <div className="text-center space-y-3">
          <p>Nenhuma sprint ativa.</p>
          <p>Peça pro Claude: "<span className="text-[var(--color-mt-text)]">inicia uma sprint</span>".</p>
        </div>
      </div>
    );
  }

  const groups: Record<'backlog' | 'doing' | 'done', CardData[]> = { backlog: [], doing: [], done: [] };
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
    { id: 'doing', title: 'Fazendo', cards: groups.doing },
    { id: 'done', title: 'Feito', cards: groups.done },
  ];

  const startedDays = Math.floor((Date.now() - sprint.startedAt) / 86_400_000) + 1;

  return (
    <div className="h-screen flex flex-col bg-[var(--color-mt-sprint-bg)]">
      <SprintClient
        columns={columns}
        sprintName={sprint.name ?? 'Sprint'}
        startedDays={startedDays}
      />
    </div>
  );
}
