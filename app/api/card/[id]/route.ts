// app/api/card/[id]/route.ts
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { getCardById } from '@/lib/core/cards';
import { listLabels } from '@/lib/core/labels';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const card = await getCardById(getDb(), id);
  const allLabels = await listLabels(getDb());
  return NextResponse.json({ card, allLabels });
}
