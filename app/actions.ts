'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { createCard, updateCard, moveCard, archiveCard } from '@/lib/core/cards';
import { addToSprint, moveInSprint, removeFromSprint, closeSprint, startSprint } from '@/lib/core/sprint';
import { addLabelToCard, removeLabelFromCard } from '@/lib/core/labels';

export async function quickCreateCardAction(projectId: string, listId: string, title: string) {
  if (!title.trim()) return;
  await createCard(getDb(), { project: projectId, list: listId, title: title.trim() });
  revalidatePath(`/project/${projectId}`);
}

export async function updateCardAction(id: string, patch: { title?: string; description?: string | null; dueDate?: string | null }) {
  const card = await updateCard(getDb(), id, patch);
  revalidatePath(`/project/${card.projectId}`);
  revalidatePath(`/sprint`);
}

export async function moveCardAction(id: string, toList: string, position?: number) {
  await moveCard(getDb(), id, { toList, position });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function archiveCardAction(id: string) {
  await archiveCard(getDb(), id);
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function moveInSprintAction(cardId: string, sprintList: 'backlog' | 'doing' | 'done', position?: number) {
  await moveInSprint(getDb(), cardId, sprintList, position);
  revalidatePath('/sprint');
}

export async function removeFromSprintAction(cardId: string) {
  await removeFromSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function addToSprintAction(cardId: string) {
  await addToSprint(getDb(), cardId);
  revalidatePath('/sprint');
}

export async function startSprintAction(name?: string) {
  await startSprint(getDb(), name);
  revalidatePath('/sprint');
}

export async function closeSprintAction(carryIncomplete = true) {
  await closeSprint(getDb(), { carryIncomplete });
  revalidatePath('/sprint');
  revalidatePath('/');
}

export async function toggleLabelAction(cardId: string, labelName: string, present: boolean) {
  if (present) await removeLabelFromCard(getDb(), cardId, labelName);
  else await addLabelToCard(getDb(), cardId, labelName);
  revalidatePath('/sprint');
  revalidatePath('/');
}
