// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getCardById, searchCards } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const card = await getCardById(db, id);
  const allLabels = await listLabels(db);
  const projectCards = await searchCards(db, { query: '', project: card.projectId });
  const candidateCards = projectCards
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, title: c.title }));
  return NextResponse.json({ card, allLabels, candidateCards });
}
