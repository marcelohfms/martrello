// mcp/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { getDb } from '@/lib/db/client';
import { firstAdminActor } from '@/lib/access/first-admin';

async function main() {
  // Local stdio use acts as the oldest active admin.
  const actor = await firstAdminActor(getDb());
  if (!actor) {
    process.stderr.write('martrello mcp: nenhum admin no banco\n');
    process.exit(1);
  }
  const server = createServer(actor);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('martrello mcp server running on stdio\n');
}

main().catch((e) => {
  process.stderr.write(`martrello mcp failed: ${(e as Error).message}\n`);
  process.exit(1);
});
