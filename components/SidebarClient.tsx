'use client';
// components/SidebarClient.tsx
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Project = {
  id: string;
  name: string;
  color: string;
  cardCount: number;
};

type Props = {
  projects: Project[];
  sprintName: string | null;
};

// ── Icon components (no emoji) ────────────────────────────────────
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function SprintIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="3" fill="currentColor" />
    </svg>
  );
}

function ProjectDot({ color }: { color: string }) {
  return (
    <span
      className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/20"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

// ── Main component ────────────────────────────────────────────────
export function SidebarClient({ projects, sprintName }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close on Escape
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Prevent body scroll when drawer open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const closeDrawer = useCallback(() => setMobileOpen(false), []);

  const sprintHref = '/sprint';
  const isSprintActive = pathname === sprintHref;

  return (
    <>
      {/* ── Mobile hamburger ──────────────────────────────────────── */}
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={mobileOpen}
        aria-controls="sidebar-nav"
        onClick={() => setMobileOpen(true)}
        className="
          md:hidden fixed top-3 left-3 z-50
          w-8 h-8 flex items-center justify-center
          rounded-md text-[var(--color-mt-muted-hi)]
          hover:text-[var(--color-mt-text)] hover:bg-[var(--color-mt-sidebar-hover)]
          transition-colors duration-[120ms]
          focus-visible:outline-2 focus-visible:outline-[var(--color-mt-accent)]
        "
      >
        <MenuIcon />
      </button>

      {/* ── Overlay (mobile only) ─────────────────────────────────── */}
      <div
        role="presentation"
        className={`sidebar-overlay md:hidden ${mobileOpen ? 'open' : ''}`}
        onClick={closeDrawer}
      />

      {/* ── Sidebar panel ─────────────────────────────────────────── */}
      <aside
        id="sidebar-nav"
        aria-label="Navegação principal"
        className={`
          sidebar-drawer md:transform-none
          ${mobileOpen ? 'open' : ''}
          fixed md:static top-0 left-0 z-50 md:z-auto
          w-60 h-full md:h-auto shrink-0
          border-r border-[var(--color-mt-line-subtle)]
          bg-[var(--color-mt-sidebar-bg)]
          flex flex-col
        `}
      >
        {/* Brand header */}
        <div className="
          px-4 py-3 flex items-center justify-between
          border-b border-[var(--color-mt-line-subtle)]
        ">
          <span className="
            text-[13px] font-semibold tracking-tight
            text-[var(--color-mt-text)]
            select-none
          ">
            <span className="text-[var(--color-mt-accent)]">mar</span>trello
          </span>
          {/* Mobile close */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeDrawer}
            className="
              md:hidden w-7 h-7 flex items-center justify-center
              rounded text-[var(--color-mt-muted)]
              hover:text-[var(--color-mt-text)] hover:bg-[var(--color-mt-sidebar-hover)]
              transition-colors duration-[120ms]
            "
          >
            <CloseIcon />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 text-[13px]">
          {/* Sprint link */}
          <Link
            href={sprintHref}
            className={`
              group flex items-center gap-2.5 px-3 py-2 mx-1 rounded-[4px]
              transition-colors duration-[120ms]
              ${isSprintActive
                ? 'bg-[var(--color-mt-sprint-accent-dim)]/20 text-[var(--color-mt-sprint-accent-hi)]'
                : 'text-[var(--color-mt-sprint-accent)] hover:bg-[var(--color-mt-sidebar-hover)] hover:text-[var(--color-mt-sprint-accent-hi)]'
              }
            `}
          >
            <span className={`
              transition-transform duration-[120ms]
              ${isSprintActive ? 'scale-125' : 'group-hover:scale-110'}
              text-[var(--color-mt-sprint-accent)]
            `}>
              <SprintIcon />
            </span>
            <span className="font-medium">
              Sprint{sprintName ? ` · ${sprintName}` : ' atual'}
            </span>
            {isSprintActive && (
              <span className="ml-auto w-1 h-1 rounded-full bg-[var(--color-mt-sprint-accent)]" />
            )}
          </Link>

          {/* Projects section */}
          <div className="
            px-3 pt-5 pb-1.5
            text-[10px] font-semibold uppercase tracking-widest
            text-[var(--color-mt-muted)]
          ">
            Projetos
          </div>

          {projects.length === 0 && (
            <p className="px-4 py-2 text-[12px] text-[var(--color-mt-muted)] italic">
              Nenhum projeto ainda.
            </p>
          )}

          {projects.map((p) => {
            const href = `/project/${p.id}`;
            const isActive = pathname === href;
            return (
              <Link
                key={p.id}
                href={href}
                className={`
                  group flex items-center justify-between gap-2 px-3 py-[7px] mx-1 rounded-[4px]
                  transition-colors duration-[120ms]
                  ${isActive
                    ? 'bg-[var(--color-mt-sidebar-active)] text-[var(--color-mt-text)]'
                    : 'text-[var(--color-mt-text-secondary)] hover:bg-[var(--color-mt-sidebar-hover)] hover:text-[var(--color-mt-text)]'
                  }
                `}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <ProjectDot color={p.color} />
                  <span className="truncate">{p.name}</span>
                </span>
                <span className="
                  mono-badge shrink-0
                  text-[var(--color-mt-muted)]
                  group-hover:text-[var(--color-mt-muted-hi)]
                  transition-colors duration-[120ms]
                ">
                  {p.cardCount}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer hint */}
        <div className="
          px-4 py-2.5 border-t border-[var(--color-mt-line-subtle)]
          text-[11px] text-[var(--color-mt-muted)] select-none
        ">
          Claude · MCP
        </div>
      </aside>
    </>
  );
}
