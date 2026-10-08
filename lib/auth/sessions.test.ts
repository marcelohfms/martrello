import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { users, sessions } from '@/lib/db/schema';
import {
  createSession, validateSession, deleteSession, deleteUserSessions, hashToken, SESSION_TTL_MS,
} from './sessions';

let db: Db;
beforeEach(async () => {
  db = makeTestDb().db;
  await db.insert(users).values({ id: 'u1', username: 'marcelo', passwordHash: 'x', createdAt: 0 });
});

describe('sessions', () => {
  it('create → validate returns the user', async () => {
    const { token, expiresAt } = await createSession(db, 'u1', 1_000);
    expect(expiresAt).toBe(1_000 + SESSION_TTL_MS);
    expect(await validateSession(db, token, 2_000)).toEqual({ id: 'u1', username: 'marcelo' });
  });

  it('stores only the token hash, never the token', async () => {
    const { token } = await createSession(db, 'u1');
    const rows = await db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0].idHash).toBe(hashToken(token));
    expect(rows[0].idHash).not.toBe(token);
  });

  it('generates distinct high-entropy tokens', async () => {
    const a = await createSession(db, 'u1');
    const b = await createSession(db, 'u1');
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
  });

  it('returns null for unknown, empty or missing tokens', async () => {
    expect(await validateSession(db, 'nope')).toBeNull();
    expect(await validateSession(db, '')).toBeNull();
    expect(await validateSession(db, undefined)).toBeNull();
  });

  it('expired session returns null and its row is deleted', async () => {
    const { token } = await createSession(db, 'u1', 0);
    expect(await validateSession(db, token, SESSION_TTL_MS)).toBeNull();
    expect(await db.select().from(sessions)).toHaveLength(0);
  });

  it('deleteSession revokes the session', async () => {
    const { token } = await createSession(db, 'u1');
    await deleteSession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it('deleteUserSessions revokes every session of that user', async () => {
    const a = await createSession(db, 'u1');
    const b = await createSession(db, 'u1');
    await deleteUserSessions(db, 'u1');
    expect(await validateSession(db, a.token)).toBeNull();
    expect(await validateSession(db, b.token)).toBeNull();
  });

  it('deleting the user cascades to sessions', async () => {
    const { token } = await createSession(db, 'u1');
    await db.delete(users).where(eq(users.id, 'u1'));
    expect(await validateSession(db, token)).toBeNull();
  });
});
