import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getProjectByNameOrId } from '@/lib/core/projects';
import { getBlockedStatuses } from '@/lib/core/dependencies';
import { getActiveSprintRow } from '@/lib/core/sprint';
import { cards as cardsTbl, labels as labelsTbl, cardLabels, sprintSlots } from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { BoardClient } from './BoardClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';
import { ProjectHeaderName } from '@/components/ProjectHeaderName';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  let project;
  try {
    project = await getProjectByNameOrId(db, id);
  } catch {
    notFound();
  }

  const cardRows = await db
    .select()
    .from(cardsTbl)
    .where(and(eq(cardsTbl.projectId, project.id), isNull(cardsTbl.archivedAt)))
    .orderBy(asc(cardsTbl.position));

  const labelRows = await db
    .select({ cardId: cardLabels.cardId, name: labelsTbl.name, color: labelsTbl.color })
    .from(cardLabels)
    .innerJoin(labelsTbl, eq(cardLabels.labelId, labelsTbl.id));

  const labelsByCard = new Map<string, Array<{ name: string; color: string }>>();
  for (const r of labelRows) {
    if (!labelsByCard.has(r.cardId)) labelsByCard.set(r.cardId, []);
    labelsByCard.get(r.cardId)!.push({ name: r.name, color: r.color });
  }

  const statuses = await getBlockedStatuses(db, cardRows.map((c) => c.id));

  const activeSprint = await getActiveSprintRow(db);
  const sprintCardIds = activeSprint
    ? new Set(
        (await db
          .select({ cardId: sprintSlots.cardId })
          .from(sprintSlots)
          .where(eq(sprintSlots.sprintId, activeSprint.id))
        ).map((s) => s.cardId),
      )
    : null;

  const totalCards = cardRows.length;

  const columns: Column[] = project.lists.map((list) => ({
    id: list.id,
    title: list.name,
    cards: cardRows.filter((c) => c.listId === list.id).map<CardData>((c) => ({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: labelsByCard.get(c.id) ?? [],
      isBlocked: statuses.get(c.id)?.isBlocked ?? false,
      inSprint: sprintCardIds ? sprintCardIds.has(c.id) : undefined,
    })),
    quickCreate: { projectId: project.id, listId: list.id },
  }));

  return (
    <div className="h-dvh flex flex-col bg-mt-bg">
      {/* Page header. Mobile keeps room for the hamburger. */}
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-mt-line bg-mt-card pl-16 pr-4 md:px-6">
        <span className="hidden text-[13px] font-medium text-mt-muted sm:inline">
          Projetos <span aria-hidden="true">//</span>
        </span>
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: project.color }}
          aria-hidden="true"
        />
        <ProjectHeaderName name={project.name} acronym={project.acronym} />
        <span className="ml-auto shrink-0 text-[13px] font-medium text-mt-muted">
          {totalCards} {totalCards === 1 ? 'card' : 'cards'}
        </span>
      </header>

      {/* Board */}
      <BoardClient columns={columns} />
    </div>
  );
}
