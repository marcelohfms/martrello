import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ulid } from 'ulidx';
import { mcpTokens, users } from '@/lib/db/schema';
import { MartrelloError } from '@/lib/errors';
import { firstAdminActor } from '@/lib/access/first-admin';
import type { Actor } from '@/lib/access/actor';
import type { Db } from '@/lib/core/test-helpers';
import { hashToken } from './sessions';

const digest = (s: string) => createHash('sha256').update(s).digest();
const unauthorized = () => Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

/** Creates a personal MCP token. The plain token is returned once; only its SHA-256 is stored. */
export async function createMcpToken(db: Db, userId: string, name: string): Promise<{ id: string; token: string }> {
  const token = 'mtr_' + randomBytes(32).toString('base64url');
  const id = ulid();
  await db.insert(mcpTokens).values({ id, userId, tokenHash: hashToken(token), name, createdAt: Date.now() });
  return { id, token };
}

export async function listMcpTokens(
  db: Db,
  userId: string,
): Promise<Array<{ id: string; name: string; createdAt: number; lastUsedAt: number | null; revokedAt: number | null }>> {
  return db
    .select({
      id: mcpTokens.id,
      name: mcpTokens.name,
      createdAt: mcpTokens.createdAt,
      lastUsedAt: mcpTokens.lastUsedAt,
      revokedAt: mcpTokens.revokedAt,
    })
    .from(mcpTokens)
    .where(eq(mcpTokens.userId, userId))
    .orderBy(desc(mcpTokens.createdAt), desc(mcpTokens.id));
}

export async function revokeMcpToken(db: Db, userId: string, tokenId: string): Promise<void> {
  const res = db
    .update(mcpTokens)
    .set({ revokedAt: Date.now() })
    .where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.userId, userId), isNull(mcpTokens.revokedAt)))
    .run();
  if (res.changes === 0) throw new MartrelloError('INVALID_INPUT', 'Token não encontrado.');
}

/** Resolves the caller of an MCP request: the shared MCP_TOKEN (first admin) or a personal token. */
export async function resolveMcpActor(
  db: Db,
  request: Request,
  envToken: string | undefined,
): Promise<Actor | Response> {
  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  if (!match) return unauthorized();
  const presented = match[1].trim();

  const expected = envToken?.trim();
  if (expected && timingSafeEqual(digest(presented), digest(expected))) {
    const admin = await firstAdminActor(db);
    return admin ?? Response.json({ error: 'NO_ADMIN' }, { status: 503 });
  }

  const row = (await db
    .select({ id: mcpTokens.id, userId: users.id, role: users.role })
    .from(mcpTokens)
    .innerJoin(users, eq(users.id, mcpTokens.userId))
    .where(and(eq(mcpTokens.tokenHash, hashToken(presented)), isNull(mcpTokens.revokedAt), isNull(users.disabledAt)))
    .limit(1))[0];
  if (!row) return unauthorized();

  await db.update(mcpTokens).set({ lastUsedAt: Date.now() }).where(eq(mcpTokens.id, row.id));
  return { kind: 'user', id: row.userId, role: row.role };
}
