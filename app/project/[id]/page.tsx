import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { getProjectByNameOrId } from '@/lib/core/projects';
import { cards as cardsTbl, labels as labelsTbl, cardLabels } from '@/lib/db/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { BoardClient } from './BoardClient';
import type { Column } from '@/components/Board';
import type { CardData } from '@/components/Card';

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

  const totalCards = cardRows.length;

  const columns: Column[] = project.lists.map((list) => ({
    id: list.id,
    title: list.name,
    cards: cardRows.filter((c) => c.listId === list.id).map<CardData>((c) => ({
      id: c.id,
      title: c.title,
      dueDate: c.dueDate,
      labels: labelsByCard.get(c.id) ?? [],
    })),
    quickCreate: { projectId: project.id, listId: list.id },
  }));

  return (
    <div className="h-dvh flex flex-col bg-[var(--color-mt-bg)]">
      {/* Page header */}
      <header className="
        flex items-center gap-3 px-4 py-2.5
        border-b border-[var(--color-mt-line-subtle)]
        shrink-0
        /* mobile: leave room for hamburger */
        pl-14 md:pl-4
      ">
        <span
          className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/20"
          style={{ background: project.color }}
          aria-hidden="true"
        />
        <h1 className="text-[14px] font-semibold text-[var(--color-mt-text)] truncate">
          {project.name}
        </h1>
        <span className="text-[12px] text-[var(--color-mt-muted)] hidden sm:inline">
          · projeto
        </span>
        <span className="mono-badge text-[var(--color-mt-muted)] ml-auto">
          {totalCards} cards
        </span>
      </header>

      {/* Board */}
      <BoardClient columns={columns} />
    </div>
  );
}
