import type { Role } from '@/lib/db/schema';
import type { SessionUser } from '@/lib/auth/sessions';

export type Actor = { kind: 'user'; id: string; role: Role } | { kind: 'system' };

export const SYSTEM_ACTOR: Actor = { kind: 'system' };

export function actorUserId(a: Actor): string | null {
  return a.kind === 'user' ? a.id : null;
}

export function toActor(u: SessionUser): Actor {
  return { kind: 'user', id: u.id, role: u.role };
}
