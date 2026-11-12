import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import { users } from '@/lib/db/schema';
import { createSession, validateSession } from './sessions';
import {
  createUser, setUserPassword, authenticate, normalizeEmail, findUserByEmail, MAX_PASSWORD_LENGTH,
} from './users';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
});

const PW = 'a-very-long-password-1';

describe('users', () => {
  it('creates a user with a hashed password, default role member', async () => {
    const u = await createUser(db, { email: 'marcelo@axivero.com.br', name: 'Marcelo', password: PW });
    expect(u.role).toBe('member');
    const rows = await db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0].passwordHash.startsWith('$argon2id$')).toBe(true);
    expect((await findUserByEmail(db, ' MARCELO@axivero.com.br '))?.id).toBe(u.id);
  });

  it('login aceita e-mail com caixa e espaços diferentes', async () => {
    await createUser(db, { email: 'Ana@Axivero.com.br', name: 'Ana', password: 'x'.repeat(12) });
    expect(await authenticate(db, '  ana@AXIVERO.com.br ', 'x'.repeat(12))).toMatchObject({
      email: 'ana@axivero.com.br', role: 'member', name: 'Ana',
    });
  });

  it('createUser com e-mail existente lança EMAIL_TAKEN', async () => {
    await createUser(db, { email: 'a@x.com', name: 'A', password: PW });
    await expect(createUser(db, { email: ' A@X.com', name: 'B', password: PW })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('authenticate devolve null para usuário desativado', async () => {
    const u = await createUser(db, { email: 'a@x.com', name: 'A', password: PW });
    await db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, u.id));
    expect(await authenticate(db, 'a@x.com', PW)).toBeNull();
  });

  it('setUserPassword encerra sessões e troca o hash', async () => {
    const u = await createUser(db, { email: 'a@x.com', name: 'A', password: PW });
    const { token } = await createSession(db, u.id);
    await setUserPassword(db, u.id, 'another-long-password-2');
    expect(await validateSession(db, token)).toBeNull();
    expect(await authenticate(db, 'a@x.com', PW)).toBeNull();
    expect(await authenticate(db, 'a@x.com', 'another-long-password-2')).toMatchObject({ id: u.id });
  });

  it('setUserPassword com usuário inexistente lança USER_NOT_FOUND', async () => {
    await expect(setUserPassword(db, 'nope', PW)).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('rejects passwords shorter than 12 characters', async () => {
    await expect(createUser(db, { email: 'a@x.com', name: 'A', password: 'short' })).rejects.toThrow(/INVALID_INPUT/);
  });

  it('rejects an empty email or name', async () => {
    await expect(createUser(db, { email: '   ', name: 'A', password: PW })).rejects.toThrow(/INVALID_INPUT/);
    await expect(createUser(db, { email: 'a@x.com', name: ' ', password: PW })).rejects.toThrow(/INVALID_INPUT/);
  });

  it('returns null for a wrong password or unknown user', async () => {
    await createUser(db, { email: 'a@x.com', name: 'A', password: PW });
    expect(await authenticate(db, 'a@x.com', 'wrong-password-123')).toBeNull();
    expect(await authenticate(db, 'ghost@x.com', PW)).toBeNull();
  });

  it('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Ana@X.COM ')).toBe('ana@x.com');
  });

  it('rejects over-long passwords without hashing', async () => {
    const u = await createUser(db, { email: 'a@x.com', name: 'A', password: PW });
    const huge = 'x'.repeat(MAX_PASSWORD_LENGTH + 1);
    const started = Date.now();
    expect(await authenticate(db, 'a@x.com', huge)).toBeNull();
    expect(Date.now() - started).toBeLessThan(20);
    await expect(setUserPassword(db, u.id, huge)).rejects.toThrow(/INVALID_INPUT/);
  });
});
