'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { requireUser } from '@/lib/auth/current-user';
import { createCard, updateCard, moveCard, archiveCard, getCardById } from '@/lib/core/cards';
import { addToSprint, moveInSprint, removeFromSprint, closeSprint, startSprint } from '@/lib/core/sprint';
import { addLabelToCard, removeLabelFromCard } from '@/lib/core/labels';
import { addDependency, removeDependency } from '@/lib/core/dependencies';

export async function quickCreateCardAction(projectId: string, listId: string, title: string) {
  await requireUser();
  if (!title.trim()) return;
  await createCard(getDb(), { project: projectId, list: listId, title: title.trim() });
  revalidatePath(`/project/${projectId}`);
}

export async function updateCardAction(id: string, patch: { title?: string; description?: string | null; dueDate?: string | null }) {
  await requireUser();
  const card = await updateCard(getDb(), id, patch);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath(`/sprint`);
}

export async function moveCardAction(id: string, toList: string, position?: number) {
  await requireUser();
  await moveCard(getDb(), id, { toList, position });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function archiveCardAction(id: string) {
  await requireUser();
  await archiveCard(getDb(), id);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function moveInSprintAction(cardId: string, sprintList: 'backlog' | 'doing' | 'done', position?: number) {
  await requireUser();
  await moveInSprint(getDb(), cardId, sprintList, position);
  revalidatePath('/sprint');
}

export async function removeFromSprintAction(cardId: string) {
  await requireUser();
  await removeFromSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function addToSprintAction(cardId: string) {
  await requireUser();
  await addToSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function startSprintAction(name?: string) {
  await requireUser();
  await startSprint(getDb(), name);
  revalidatePath('/sprint');
}

export async function closeSprintAction(carryIncomplete = true) {
  await requireUser();
  await closeSprint(getDb(), { carryIncomplete });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function toggleLabelAction(cardId: string, labelName: string, present: boolean) {
  await requireUser();
  if (present) await removeLabelFromCard(getDb(), cardId, labelName);
  else await addLabelToCard(getDb(), cardId, labelName);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function addDependencyAction(cardId: string, blockerCardId: string) {
  await requireUser();
  await addDependency(getDb(), cardId, blockerCardId);
  const card = await getCardById(getDb(), cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}

export async function removeDependencyAction(cardId: string, blockerCardId: string) {
  await requireUser();
  await removeDependency(getDb(), cardId, blockerCardId);
  const card = await getCardById(getDb(), cardId);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath('/sprint');
}
