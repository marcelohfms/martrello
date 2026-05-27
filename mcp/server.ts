// mcp/server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { tools, findTool } from './tools';
import { MartrelloError } from '@/lib/errors';

export function createServer() {
  const server = new Server(
    { name: 'martrello', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => t.definition),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = findTool(req.params.name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify({ error: 'UNKNOWN_TOOL', message: req.params.name }) }],
      };
    }
    try {
      const result = await tool.handler(req.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      const payload = e instanceof MartrelloError ? e.toJSON() : { error: 'INTERNAL', message: (e as Error).message };
      return {
        isError: true,
        content: [{ type: 'text', text: JSON.stringify(payload) }],
      };
    }
  });

  return server;
}
