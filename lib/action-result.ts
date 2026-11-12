import { MartrelloError } from '@/lib/errors';

export type ActionResult = { ok: true } | { error: string };

/** Core errors travel to the client as a message: a thrown error would be masked in production. */
export function toResult(e: unknown): { error: string } {
  if (e instanceof MartrelloError) return { error: e.originalMessage };
  throw e;
}
