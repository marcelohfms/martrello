import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { getMySprint, type SprintStage } from '@/lib/core/sprint';
import { weekBounds, weekStartISO } from '@/lib/core/week';
import { SprintClient } from './SprintClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

export default async function SprintPage() {
  const { actor } = await requireActor();
  const now = new Date();
  const sprint = await getMySprint(getDb(), actor, now);

  const groups: Record<SprintStage, CardData[]> = { todo: [], doing: [], done: [] };
  for (const c of sprint.cards) {
    groups[c.stage].push({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: c.labels,
      projectName: c.projectName,
      projectAcronym: c.projectAcronym,
      projectColor: c.projectColor,
      isBlocked: c.isBlocked,
    });
  }

  // Column ids are stage keys: dragging between them moves the card to that stage.
  const columns: Column[] = [
    { id: 'todo',  title: 'A fazer', cards: groups.todo },
    { id: 'doing', title: 'Fazendo', cards: groups.doing },
    { id: 'done',  title: 'Feito',   cards: groups.done },
  ];

  const weekStartMs = weekBounds(weekStartISO(now)).startMs;
  const weekDay = Math.min(7, Math.floor((now.getTime() - weekStartMs) / 86_400_000) + 1);

  return (
    <div className="h-dvh flex flex-col bg-mt-bg">
      <SprintClient columns={columns} sprintName={sprint.name} weekDay={weekDay} />
    </div>
  );
}
