// scripts/backfill-acronyms.ts
import { getDb, closeDb } from '@/lib/db/client';
import { listProjects, updateProject, PROJECT_COLOR_PALETTE } from '@/lib/core/projects';
import { suggestAcronym } from '@/lib/core/acronym';

async function main() {
  const db = getDb();
  const all = await listProjects(db, { includeArchived: true });

  let colorIndex = 0;
  for (const p of all) {
    const patch: { acronym?: string; color?: string } = {};

    if (!p.acronym) {
      patch.acronym = suggestAcronym(p.name);
    }

    patch.color = PROJECT_COLOR_PALETTE[colorIndex % PROJECT_COLOR_PALETTE.length];
    colorIndex += 1;

    if (Object.keys(patch).length > 0) {
      await updateProject(db, p.id, patch);
      console.log(`~ ${p.name}: acronym=${patch.acronym ?? '(mantido: ' + p.acronym + ')'}, color=${patch.color}`);
    }
  }

  closeDb();
  console.log('backfill concluído');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
