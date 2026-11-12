import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { getProject } from '@/lib/core/projects';
import { getBlockedStatuses } from '@/lib/core/dependencies';
import { cards as cardsTbl, labels as labelsTbl, cardLabels, users } from '@/lib/db/schema';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { BoardClient } from './BoardClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';
import { ProjectHeaderName } from '@/components/ProjectHeaderName';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const { actor } = await requireActor();
  let project;
  try {
    project = await getProject(db, actor, id);
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

  const assigneeIds = [...new Set(cardRows.flatMap((c) => (c.assigneeId ? [c.assigneeId] : [])))];
  const assigneeRows = assigneeIds.length
    ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, assigneeIds))
    : [];
  const assigneeName = new Map(assigneeRows.map((u) => [u.id, u.name]));

  const statuses = await getBlockedStatuses(db, cardRows.map((c) => c.id));

  const totalCards = cardRows.length;

  const columns: Column[] = project.lists.map((list) => {
    const isDone = list.stage === 'done';
    const listCards = cardRows.filter((c) => c.listId === list.id);
    // Feito shows the latest completions first; the other stages keep their manual order.
    if (isDone) listCards.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return {
      id: list.id,
      title: list.name,
      ordered: isDone,
      cards: listCards.map<CardData>((c) => ({
        id: c.id,
        title: c.title,
        dueDate: c.dueDate,
        labels: labelsByCard.get(c.id) ?? [],
        isBlocked: statuses.get(c.id)?.isBlocked ?? false,
        assignee: c.assigneeId && assigneeName.has(c.assigneeId) ? { name: assigneeName.get(c.assigneeId)! } : null,
        completedAt: isDone ? c.completedAt : null,
      })),
      quickCreate: isDone ? undefined : { projectId: project.id, listId: list.id },
    };
  });

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
