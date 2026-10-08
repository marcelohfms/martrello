import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeTestDb, type Db } from '@/lib/core/test-helpers';
import * as clientModule from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { POST } from './route';

let db: Db;
beforeEach(() => {
  db = makeTestDb().db;
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
    await createProject(db, { name: 'Remote Check' });
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
});
