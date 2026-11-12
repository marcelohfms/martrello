// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { MartrelloError } from '@/lib/errors';
import { getCardById, searchCards } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';
import { listMembers } from '@/lib/core/members';
import { listCardEvents } from '@/lib/core/events';
import { lists, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getCycleFreeCandidates } from '@/lib/core/dependencies';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await requireActor();
  const db = getDb();
  let card;
  try {
    card = await getCardById(db, actor, id);
  } catch (e) {
    if (e instanceof MartrelloError && e.code === 'CARD_NOT_FOUND') {
      return NextResponse.json({ error: e.code, message: e.originalMessage }, { status: 404 });
    }
    throw e;
  }
  const allLabels = await listLabels(db);
  const projectCards = await searchCards(db, actor, { query: '', project: card.projectId });
  const otherCards = projectCards.filter((c) => c.id !== id);
  const cycleFreeIds = new Set(await getCycleFreeCandidates(db, id, otherCards.map((c) => c.id)));
  const candidateCards = otherCards
    .filter((c) => cycleFreeIds.has(c.id))
    .map((c) => ({ id: c.id, title: c.title }));
  const members = (await listMembers(db, actor, card.projectId)).filter((m) => !m.disabled || m.id === card.assigneeId);
  // The picker shows an assignee who left the project or was deactivated as a disabled option.
  const assignee = card.assignee
    ? {
        ...card.assignee,
        disabled: (await db.select({ d: users.disabledAt }).from(users).where(eq(users.id, card.assignee.id)))[0]?.d != null,
      }
    : null;
  const history = await listCardEvents(db, actor, id);
  const stage = (await db.select({ stage: lists.stage }).from(lists).where(eq(lists.id, card.listId)))[0]?.stage;
  return NextResponse.json({ card: { ...card, assignee, stage }, allLabels, candidateCards, members, history });
}
