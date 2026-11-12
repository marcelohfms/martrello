// app/api/mcp/route.ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '@/mcp/server';
import { checkMcpAuth } from '@/lib/auth/mcp-token';
import { firstAdminActor } from '@/lib/access/first-admin';
import { getDb } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const denied = checkMcpAuth(request, process.env.MCP_TOKEN);
  if (denied) return denied;

  // The shared MCP_TOKEN acts as the oldest active admin.
  const actor = await firstAdminActor(getDb());
  if (!actor) return Response.json({ error: 'NO_ADMIN' }, { status: 503 });

  // Stateless: a fresh server + transport per request, JSON responses (no SSE).
  const server = createServer(actor);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
