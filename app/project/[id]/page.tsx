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
    <div className="h-screen flex flex-col">
      <header className="px-4 py-3 border-b border-[var(--color-mt-line)] flex items-center gap-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: project.color }} />
        <h1 className="text-sm font-semibold">{project.name}</h1>
        <span className="text-xs text-[var(--color-mt-muted)]">· projeto</span>
      </header>
      <BoardClient columns={columns} />
    </div>
  );
}
