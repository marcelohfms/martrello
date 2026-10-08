import { describe, it, expect } from 'vitest';
import { checkMcpAuth } from './mcp-token';

const req = (auth?: string) =>
  new Request('http://localhost/api/mcp', { method: 'POST', headers: auth ? { authorization: auth } : {} });

describe('checkMcpAuth', () => {
  it('503 MCP_DISABLED when no token is configured', async () => {
    for (const configured of [undefined, '', '   ']) {
      const res = checkMcpAuth(req('Bearer x'), configured)!;
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'MCP_DISABLED' });
    }
  });
  it('401 without an Authorization header', async () => {
    const res = checkMcpAuth(req(), 'secret')!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'UNAUTHORIZED' });
  });
  it('401 for a non-Bearer scheme', () => {
    expect(checkMcpAuth(req('Basic secret'), 'secret')!.status).toBe(401);
  });
  it('401 for a wrong token', () => {
    expect(checkMcpAuth(req('Bearer nope'), 'secret')!.status).toBe(401);
  });
  it('authorizes the right token (case-insensitive scheme)', () => {
    expect(checkMcpAuth(req('Bearer secret'), 'secret')).toBeNull();
    expect(checkMcpAuth(req('bearer secret'), 'secret')).toBeNull();
  });
  it('trims surrounding whitespace in the configured token', () => {
    expect(checkMcpAuth(req('Bearer secret'), 'secret\n')).toBeNull();
  });
});
