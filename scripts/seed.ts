// scripts/seed.ts
import { getDb, closeDb } from '@/lib/db/client';
import { createProject } from '@/lib/core/projects';
import { createLabel } from '@/lib/core/labels';
import { MartrelloError } from '@/lib/errors';

const DEFAULT_LABELS = [
  { name: 'urgente', color: '#ef4444' },
  { name: 'bug', color: '#f97316' },
  { name: 'melhoria', color: '#3b82f6' },
  { name: 'ideia', color: '#a855f7' },
  { name: 'pessoal', color: '#10b981' },
];

async function safeCreateProject(db: ReturnType<typeof getDb>, name: string) {
  try {
    await createProject(db, { name });
    console.log(`+ projeto: ${name}`);
  } catch (e) {
    if (e instanceof MartrelloError && e.code === 'NAME_CONFLICT') {
      console.log(`= projeto já existe: ${name}`);
    } else throw e;
  }
}

async function safeCreateLabel(db: ReturnType<typeof getDb>, name: string, color: string) {
  try {
    await createLabel(db, name, color);
    console.log(`+ label: ${name}`);
  } catch (e) {
    if (e instanceof MartrelloError && e.code === 'NAME_CONFLICT') {
      console.log(`= label já existe: ${name}`);
    } else throw e;
  }
}

async function main() {
  const db = getDb();
  await safeCreateProject(db, 'Inbox');
  for (const l of DEFAULT_LABELS) await safeCreateLabel(db, l.name, l.color);
  closeDb();
  console.log('seed concluído');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
