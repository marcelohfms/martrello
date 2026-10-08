import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function checkMcpAuth(request: Request, expectedToken: string | undefined): Response | null {
  const expected = expectedToken?.trim();
  if (!expected) return Response.json({ error: 'MCP_DISABLED' }, { status: 503 });

  const match = /^Bearer\s+(.+)$/i.exec((request.headers.get('authorization') ?? '').trim());
  if (!match) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });

  const ok = timingSafeEqual(digest(match[1].trim()), digest(expected));
  return ok ? null : Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
}
