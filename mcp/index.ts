// mcp/index.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server';
import { getDb } from '@/lib/db/client';
import { firstAdminActor } from '@/lib/access/first-admin';
import { SYSTEM_ACTOR } from '@/lib/access/actor';

async function main() {
  // Local stdio use acts as the oldest active admin (system when there is none yet).
  const actor = (await firstAdminActor(getDb())) ?? SYSTEM_ACTOR;
  const server = createServer(actor);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('martrello mcp server running on stdio\n');
}

main().catch((e) => {
  process.stderr.write(`martrello mcp failed: ${(e as Error).message}\n`);
  process.exit(1);
});
