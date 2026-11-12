import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import { mcpTokens, users } from '@/lib/db/schema';
import { hashToken } from './sessions';
import { createMcpToken, listMcpTokens, revokeMcpToken, resolveMcpActor } from './mcp-tokens';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
});

const req = (auth?: string) =>
  new Request('http://localhost/api/mcp', { method: 'POST', headers: auth ? { authorization: auth } : {} });

describe('createMcpToken / listMcpTokens / revokeMcpToken', () => {
  it('gera token mtr_ e guarda só o hash', async () => {
    const { user } = await makeUser(db);
    const { id, token } = await createMcpToken(db, user.id, 'laptop');
    expect(token).toMatch(/^mtr_[A-Za-z0-9_-]{43}$/);
    const row = db.select().from(mcpTokens).where(eq(mcpTokens.id, id)).get()!;
    expect(row.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('lista só os tokens do usuário, sem expor o token', async () => {
    const a = await makeUser(db);
    const b = await makeUser(db);
    await createMcpToken(db, a.user.id, 'a1');
    await createMcpToken(db, b.user.id, 'b1');
    const list = await listMcpTokens(db, a.user.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: 'a1', lastUsedAt: null, revokedAt: null });
    expect(Object.keys(list[0]).sort()).toEqual(['createdAt', 'id', 'lastUsedAt', 'name', 'revokedAt']);
  });

  it('revoga só token do próprio dono', async () => {
    const a = await makeUser(db);
    const b = await makeUser(db);
    const t = await createMcpToken(db, a.user.id, 'x');
    await expect(revokeMcpToken(db, b.user.id, t.id)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(revokeMcpToken(db, a.user.id, 'nope')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await revokeMcpToken(db, a.user.id, t.id);
    expect((await listMcpTokens(db, a.user.id))[0].revokedAt).not.toBeNull();
  });
});

describe('resolveMcpActor', () => {
  it('401 sem header, com esquema não-Bearer ou token errado', async () => {
    for (const h of [undefined, 'Basic abc', 'Bearer nope']) {
      const res = (await resolveMcpActor(db, req(h), 'secret')) as Response;
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
    }
  });

  it('token pessoal vira o ator do dono e atualiza lastUsedAt', async () => {
    const { user } = await makeUser(db, { role: 'member' });
    const { token, id } = await createMcpToken(db, user.id, 'x');
    const actor = await resolveMcpActor(db, req(`bearer ${token}`), undefined);
    expect(actor).toEqual({ kind: 'user', id: user.id, role: 'member' });
    expect(db.select().from(mcpTokens).where(eq(mcpTokens.id, id)).get()!.lastUsedAt).not.toBeNull();
  });

  it('token revogado → 401', async () => {
    const { user } = await makeUser(db);
    const { token, id } = await createMcpToken(db, user.id, 'x');
    await revokeMcpToken(db, user.id, id);
    expect(((await resolveMcpActor(db, req(`Bearer ${token}`), 'secret')) as Response).status).toBe(401);
  });

  it('usuário desativado → 401', async () => {
    const { user } = await makeUser(db);
    const { token } = await createMcpToken(db, user.id, 'x');
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, user.id)).run();
    expect(((await resolveMcpActor(db, req(`Bearer ${token}`), 'secret')) as Response).status).toBe(401);
  });

  it('MCP_TOKEN (com espaços ao redor) age como o primeiro admin', async () => {
    const { user } = await makeUser(db, { role: 'admin' });
    const actor = await resolveMcpActor(db, req('Bearer secret'), 'secret\n');
    expect(actor).toEqual({ kind: 'user', id: user.id, role: 'admin' });
  });

  it('MCP_TOKEN sem admin → 503 NO_ADMIN', async () => {
    const res = (await resolveMcpActor(db, req('Bearer secret'), 'secret')) as Response;
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'NO_ADMIN' });
  });
});
