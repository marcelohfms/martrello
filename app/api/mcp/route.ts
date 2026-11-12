// app/api/mcp/route.ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '@/mcp/server';
import { resolveMcpActor } from '@/lib/auth/mcp-tokens';
import { getDb } from '@/lib/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const actor = await resolveMcpActor(getDb(), request, process.env.MCP_TOKEN);
  if (actor instanceof Response) return actor;

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
