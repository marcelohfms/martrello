// mcp/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';

async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('martrello mcp server running on stdio\n');
}

main().catch((e) => {
  process.stderr.write(`martrello mcp failed: ${(e as Error).message}\n`);
  process.exit(1);
});
