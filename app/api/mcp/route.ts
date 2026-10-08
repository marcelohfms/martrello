// app/api/mcp/route.ts
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from '@/mcp/server';
import { checkMcpAuth } from '@/lib/auth/mcp-token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const denied = checkMcpAuth(request, process.env.MCP_TOKEN);
  if (denied) return denied;

  // Stateless: a fresh server + transport per request, JSON responses (no SSE).
  const server = createServer();
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
