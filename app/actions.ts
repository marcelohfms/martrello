'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { createCard, updateCard, moveCard, archiveCard, getCardById, assignCard } from '@/lib/core/cards';
import { listCardEvents } from '@/lib/core/events';
import { toResult, type ActionResult } from '@/lib/action-result';
import { addLabelToCard, removeLabelFromCard } from '@/lib/core/labels';
import { addDependency, removeDependency } from '@/lib/core/dependencies';

export async function quickCreateCardAction(projectId: string, listId: string, title: string) {
  const { actor } = await requireActor();
  if (!title.trim()) return;
  await createCard(getDb(), actor, { project: projectId, list: listId, title: title.trim() });
  revalidatePath(`/project/${projectId}`);
}

export async function updateCardAction(id: string, patch: { title?: string; description?: string | null; dueDate?: string | null }) {
  const { actor } = await requireActor();
  const card = await updateCard(getDb(), actor, id, patch);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath(`/sprint`);
}

export async function moveCardAction(id: string, toList: string, position?: number) {
  const { actor } = await requireActor();
  await moveCard(getDb(), actor, id, { toList, position });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function archiveCardAction(id: string) {
  const { actor } = await requireActor();
  await archiveCard(getDb(), actor, id);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function toggleLabelAction(cardId: string, labelName: string, present: boolean) {
  const { actor } = await requireActor();
  if (present) await removeLabelFromCard(getDb(), actor, cardId, labelName);
  else await addLabelToCard(getDb(), actor, cardId, labelName);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function addDependencyAction(cardId: string, blockerCardId: string) {
  const { actor } = await requireActor();
  await addDependency(getDb(), actor, cardId, blockerCardId);
  const card = await getCardById(getDb(), actor, cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}

export async function removeDependencyAction(cardId: string, blockerCardId: string) {
  const { actor } = await requireActor();
  await removeDependency(getDb(), actor, cardId, blockerCardId);
  const card = await getCardById(getDb(), actor, cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}

export async function assignCardAction(cardId: string, assignee: string | null): Promise<ActionResult> {
  const { actor } = await requireActor();
  try {
    const card = await assignCard(getDb(), actor, cardId, assignee);
    revalidatePath(`/project/${card.projectId}`);
    revalidatePath('/sprint');
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function getCardHistoryAction(cardId: string) {
  const { actor } = await requireActor();
  try {
    return { ok: true as const, history: await listCardEvents(getDb(), actor, cardId) };
  } catch (e) {
    return toResult(e);
  }
}
