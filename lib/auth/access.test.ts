import { describe, it, expect } from 'vitest';
import { decideAccess } from './access';

describe('decideAccess', () => {
  it('lets /api/mcp through regardless of session (it has its own auth)', () => {
    expect(decideAccess('/api/mcp', false)).toBe('allow');
    expect(decideAccess('/api/mcp/', false)).toBe('allow');
  });
  it('does not treat lookalike paths as the MCP endpoint', () => {
    expect(decideAccess('/api/mcpx', false)).toBe('unauthorized');
  });
  it('shows /login to anonymous users and bounces logged-in users home', () => {
    expect(decideAccess('/login', false)).toBe('allow');
    expect(decideAccess('/login', true)).toBe('redirect-home');
  });
  it('allows everything else when authenticated', () => {
    expect(decideAccess('/', true)).toBe('allow');
    expect(decideAccess('/api/stream', true)).toBe('allow');
  });
  it('answers anonymous API calls with 401 instead of a redirect', () => {
    expect(decideAccess('/api/stream', false)).toBe('unauthorized');
    expect(decideAccess('/api/card/abc', false)).toBe('unauthorized');
  });
  it('redirects anonymous page requests to /login', () => {
    expect(decideAccess('/', false)).toBe('redirect-login');
    expect(decideAccess('/project/123', false)).toBe('redirect-login');
    expect(decideAccess('/sprint', false)).toBe('redirect-login');
  });
  it('lets invite, forgot and reset pages through with or without login', () => {
    for (const path of ['/convite/abc', '/esqueci-senha', '/redefinir-senha/abc']) {
      expect(decideAccess(path, false)).toBe('allow');
      expect(decideAccess(path, true)).toBe('allow');
    }
  });
  it('does not open lookalike paths', () => {
    expect(decideAccess('/convitex/abc', false)).toBe('redirect-login');
    expect(decideAccess('/esqueci-senhas', false)).toBe('redirect-login');
  });
});
