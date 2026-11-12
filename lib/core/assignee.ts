// lib/core/assignee.ts — who may be responsible for a card in a project.
import { and, eq, isNull, or } from 'drizzle-orm';
import { projectMembers, users, type User } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { actorUserId, type Actor } from '@/lib/access/actor';
import type { Db } from './test-helpers';

export const ASSIGNEE_REQUIRED_MESSAGE = 'A tarefa precisa de um responsável para sair do Backlog.';

/** Accepts a user id, e-mail or name. The user must be an active member of the project. */
export async function resolveAssignee(db: Db, projectId: string, ref: string): Promise<User> {
  const trimmed = ref.trim();
  const rows = await db
    .select({ u: users })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(
      eq(projectMembers.projectId, projectId),
      isNull(users.disabledAt),
      or(eq(users.id, trimmed), eq(users.email, trimmed.toLowerCase()), eq(users.name, trimmed)),
    ));
  const found = rows[0]?.u;
  if (!found) throw new MartrelloError('ASSIGNEE_NOT_MEMBER', `${ref} não é membro ativo deste projeto.`);
  return found;
}

/** The assignee a card gets when it lives outside the Backlog without one: the actor. */
export function actorAsAssignee(actor: Actor): string {
  const id = actorUserId(actor);
  if (!id) throw new MartrelloError('ASSIGNEE_REQUIRED', ASSIGNEE_REQUIRED_MESSAGE);
  return id;
}

export async function userEmail(db: Db, userId: string | null): Promise<string | null> {
  if (!userId) return null;
  return (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)))[0]?.email ?? null;
}
