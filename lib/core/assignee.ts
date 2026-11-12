// lib/core/assignee.ts — who may be responsible for a card in a project.
import { and, eq, isNull, or } from 'drizzle-orm';
import { projectMembers, users, type User } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { actorUserId, type Actor } from '@/lib/access/actor';
import type { Db } from './test-helpers';

export const ASSIGNEE_REQUIRED_MESSAGE = 'A tarefa precisa de um responsável para sair do Backlog.';

const notMember = (ref: string) => new MartrelloError('ASSIGNEE_NOT_MEMBER', `${ref} não é membro ativo deste projeto.`);

/**
 * Accepts a user id, e-mail or name. The user must be an active member of the project.
 * A name shared by more than one active member is ambiguous (INVALID_INPUT).
 */
export async function resolveAssignee(db: Db, projectId: string, ref: string): Promise<User> {
  const trimmed = ref.trim();
  const email = trimmed.toLowerCase();
  const rows = (await db
    .select({ u: users })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(
      eq(projectMembers.projectId, projectId),
      isNull(users.disabledAt),
      or(eq(users.id, trimmed), eq(users.email, email), eq(users.name, trimmed)),
    ))).map((r) => r.u);
  const exact = rows.find((u) => u.id === trimmed || u.email === email);
  if (exact) return exact;
  if (rows.length > 1) {
    throw new MartrelloError('INVALID_INPUT', `Mais de um membro com o nome '${trimmed}'. Use o e-mail.`);
  }
  if (!rows[0]) throw notMember(ref);
  return rows[0];
}

export async function isActiveMember(db: Db, projectId: string, userId: string): Promise<boolean> {
  const row = (await db
    .select({ id: users.id })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(eq(projectMembers.projectId, projectId), eq(users.id, userId), isNull(users.disabledAt))))[0];
  return Boolean(row);
}

export async function assertActiveMember(db: Db, projectId: string, userId: string): Promise<void> {
  if (!(await isActiveMember(db, projectId, userId))) throw notMember((await userEmail(db, userId)) ?? userId);
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
