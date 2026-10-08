// scripts/build-scripts.ts — bundles ops CLIs for the production image (no tsx there).
import { build } from 'esbuild';
import path from 'node:path';

const ENTRIES = ['migrate', 'user-set', 'backup'];

async function main() {
  for (const name of ENTRIES) {
    await build({
      entryPoints: [path.resolve(`scripts/${name}.ts`)],
      outfile: path.resolve(`dist/scripts/${name}.js`),
      bundle: true,
      platform: 'node',
      target: 'node24',
      format: 'esm',
      external: ['better-sqlite3', '@node-rs/argon2'],
      banner: {
        js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
      },
    });
    console.log(`built dist/scripts/${name}.js`);
  }
}

main().catch((e) => {
  process.stderr.write(`build failed: ${(e as Error).message}\n`);
  process.exit(1);
});
