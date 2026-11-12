// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { MartrelloError } from '@/lib/errors';
import { getCardById, searchCards } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';
import { getCycleFreeCandidates } from '@/lib/core/dependencies';
import { getCardSprintState } from '@/lib/core/sprint';

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
  const inSprint = await getCardSprintState(db, id);
  return NextResponse.json({ card, allLabels, candidateCards, inSprint });
}
