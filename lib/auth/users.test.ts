import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { users } from '@/lib/db/schema';
import { createSession, validateSession } from './sessions';
import { setUserPassword, authenticate, normalizeUsername, MAX_PASSWORD_LENGTH } from './users';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
});

const PW = 'a-very-long-password-1';

describe('users', () => {
  it('creates a user with a hashed password', async () => {
    const r = await setUserPassword(db, 'marcelo', PW);
    expect(r.created).toBe(true);
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash.startsWith('$argon2id$')).toBe(true);
  });

  it('updating the password replaces the hash and revokes sessions', async () => {
    const { id } = await setUserPassword(db, 'marcelo', PW);
    const { token } = await createSession(db, id);
    const r = await setUserPassword(db, 'marcelo', 'another-long-password-2');
    expect(r).toEqual({ id, username: 'marcelo', created: false });
    expect(await validateSession(db, token)).toBeNull();
    expect(await authenticate(db, 'marcelo', PW)).toBeNull();
    expect(await authenticate(db, 'marcelo', 'another-long-password-2')).toEqual({ id, username: 'marcelo' });
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await expect(setUserPassword(db, 'marcelo', 'short')).rejects.toThrow(/INVALID_INPUT/);
  });

  it('rejects an empty username', async () => {
    await expect(setUserPassword(db, '   ', PW)).rejects.toThrow(/INVALID_INPUT/);
  });

  it('authenticates with the right password', async () => {
    const { id } = await setUserPassword(db, 'marcelo', PW);
    expect(await authenticate(db, 'marcelo', PW)).toEqual({ id, username: 'marcelo' });
  });

  it('returns null for a wrong password or unknown user', async () => {
    await setUserPassword(db, 'marcelo', PW);
    expect(await authenticate(db, 'marcelo', 'wrong-password-123')).toBeNull();
    expect(await authenticate(db, 'ghost', PW)).toBeNull();
  });

  it('normalizes username on set and authenticate', async () => {
    expect(normalizeUsername('  Marcelo ')).toBe('marcelo');
    const { id } = await setUserPassword(db, ' Marcelo ', PW);
    expect(await authenticate(db, 'MARCELO', PW)).toEqual({ id, username: 'marcelo' });
  });

  it('rejects over-long passwords without hashing', async () => {
    await setUserPassword(db, 'marcelo', PW);
    const huge = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
    const started = Date.now();
    expect(await authenticate(db, 'marcelo', huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(20);
    await expect(setUserPassword(db, 'marcelo', huge)).rejects.toThrow(/INVALID_INPUT/);
  });
});
