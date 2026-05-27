// scripts/build-mcp.ts
import { build } from 'esbuild';
import path from 'node:path';

async function main() {
  await build({
    entryPoints: [path.resolve('mcp/index.ts')],
    outfile: path.resolve('mcp/dist/index.js'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    external: ['better-sqlite3'],
    banner: {
      js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
    },
  });

  console.log('built mcp/dist/index.js');
}

main().catch((e) => {
  process.stderr.write(`build failed: ${(e as Error).message}\n`);
  process.exit(1);
});
