// components/Sidebar.tsx
import Link from 'next/link';
import { getDb } from '@/lib/db/client';
import { listProjects } from '@/lib/core/projects';
import { getActiveSprintRow } from '@/lib/core/sprint';

export async function Sidebar() {
  const projects = await listProjects(getDb());
  const activeSprint = await getActiveSprintRow(getDb());

  return (
    <aside className="w-64 shrink-0 border-r border-[var(--color-mt-line)] bg-[#0a1622] flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--color-mt-line)] text-sm font-semibold tracking-wide">
        martrello
      </div>
      <nav className="flex-1 overflow-y-auto py-2 text-sm">
        <Link
          href="/sprint"
          className="flex items-center gap-2 px-4 py-2 hover:bg-[var(--color-mt-list)] text-[var(--color-mt-sprint-accent)]"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--color-mt-sprint-accent)]" />
          Sprint {activeSprint?.name ? `· ${activeSprint.name}` : 'atual'}
        </Link>
        <div className="px-4 pt-4 pb-1 text-xs uppercase text-[var(--color-mt-muted)] tracking-wider">
          Projetos
        </div>
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/project/${p.id}`}
            className="flex items-center justify-between px-4 py-2 hover:bg-[var(--color-mt-list)]"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
              <span className="truncate">{p.name}</span>
            </span>
            <span className="text-xs text-[var(--color-mt-muted)]">{p.cardCount}</span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
