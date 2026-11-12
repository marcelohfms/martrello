import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, addMemberRow, type Db } from '@/lib/core/test-helpers';
import { users } from '@/lib/db/schema';
import { listCardEvents } from '@/lib/core/events';
import type { Actor } from '@/lib/access/actor';
import * as clientModule from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { createMcpToken, revokeMcpToken } from '@/lib/auth/mcp-tokens';
import { POST } from './route';

let db: Db;
let admin: Actor;
let adminId: string;
beforeEach(async () => {
  db = makeTestDb().db;
  const a = await makeUser(db, { role: 'admin', name: 'Marcelo' });
  admin = a.actor;
  adminId = a.user.id;
  vi.spyOn(clientModule, 'getDb').mockReturnValue(db as any);
  process.env.MCP_TOKEN = 'test-token';
});
afterEach(() => {
  delete process.env.MCP_TOKEN;
  vi.restoreAllMocks();
});

function rpc(body: unknown, token?: string) {
  return new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/mcp', () => {
  it('rejects requests without the token', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }));
    expect(res.status).toBe(401);
  });

  it('lists tools with a valid token', async () => {
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, 'test-token'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('martrello_list_projects');
  });

  it('calls a tool against the database', async () => {
    await createProject(db, admin, { name: 'Remote Check' });
    const res = await POST(
      rpc(
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'martrello_list_projects', arguments: {} } },
        'test-token',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.content[0].text).toContain('Remote Check');
  });

  it('MCP_TOKEN age como o admin mais antigo e ativo', async () => {
    const newer = await makeUser(db, { role: 'admin', name: 'Outro' });
    db.update(users).set({ createdAt: Date.now() + 1000 }).where(eq(users.id, newer.user.id)).run();
    await createProject(db, admin, { name: 'P' });
    const res = await POST(
      rpc(
        {
          jsonrpc: '2.0', id: 3, method: 'tools/call',
          params: { name: 'martrello_create_card', arguments: { project: 'P', list: 'A fazer', title: 't' } },
        },
        'test-token',
      ),
    );
    const card = JSON.parse((await res.json()).result.content[0].text);
    expect(card.assigneeId).toBe(adminId);
    const events = await listCardEvents(db, admin, card.id);
    expect(events[0].actorName).toBe('Marcelo');
  });

  it('sem admin ativo responde 503 NO_ADMIN', async () => {
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, adminId)).run();
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, 'test-token'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'NO_ADMIN' });
  });

  const call = (name: string, args: unknown, token: string) =>
    POST(rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name, arguments: args } }, token));

  it('token pessoal age como o dono: membro não vê projeto alheio via list_projects', async () => {
    await createProject(db, admin, { name: 'Secreto' });
    const m = await makeUser(db, { name: 'Caio' });
    const { token } = await createMcpToken(db, m.user.id, 'x');
    const res = await call('martrello_list_projects', {}, token);
    expect(res.status).toBe(200);
    expect((await res.json()).result.content[0].text).not.toContain('Secreto');
  });

  it('token pessoal funciona sem MCP_TOKEN configurado', async () => {
    delete process.env.MCP_TOKEN;
    const m = await makeUser(db);
    const { token } = await createMcpToken(db, m.user.id, 'x');
    const res = await POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, token));
    expect(res.status).toBe(200);
  });

  it('token revogado → 401', async () => {
    const m = await makeUser(db);
    const { token, id } = await createMcpToken(db, m.user.id, 'x');
    await revokeMcpToken(db, m.user.id, id);
    expect((await call('martrello_list_projects', {}, token)).status).toBe(401);
  });

  it('token de usuário desativado → 401', async () => {
    const m = await makeUser(db);
    const { token } = await createMcpToken(db, m.user.id, 'x');
    db.update(users).set({ disabledAt: Date.now() }).where(eq(users.id, m.user.id)).run();
    expect((await call('martrello_list_projects', {}, token)).status).toBe(401);
  });

  it('create_card com list "A fazer" sem assignee fica com quem chamou', async () => {
    const p = await createProject(db, admin, { name: 'P2' });
    const m = await makeUser(db, { name: 'Caio' });
    addMemberRow(db, p.id, m.user.id);
    const { token } = await createMcpToken(db, m.user.id, 'x');
    const res = await call('martrello_create_card', { project: 'P2', list: 'A fazer', title: 't' }, token);
    const card = JSON.parse((await res.json()).result.content[0].text);
    expect(card.assigneeId).toBe(m.user.id);
    const events = await listCardEvents(db, admin, card.id);
    expect(events[0].actorName).toBe('Caio');
  });
});
