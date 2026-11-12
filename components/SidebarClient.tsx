'use client';
// components/SidebarClient.tsx
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Eye, EyeOff, LogOut, Menu, Shield, User, X, Zap } from 'lucide-react';
import { useProjectPrivacy } from './ProjectPrivacyContext';
import { logoutAction } from '@/app/login/actions';

type Project = {
  id: string;
  name: string;
  acronym: string;
  color: string;
  cardCount: number;
};

type Props = {
  projects: Project[];
  sprintName: string | null;
  isAdmin: boolean;
};

function ProjectDot({ color }: { color: string }) {
  return (
    <span
      className="size-2 shrink-0 rounded-full ring-1 ring-white/25"
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}

function FooterLink({ href, label, icon, active }: { href: string; label: string; icon: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`
        flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 font-medium no-underline
        transition-colors duration-[var(--duration-fast)] ease-out
        ${active ? 'bg-mt-rail-active text-mt-rail-strong' : 'text-mt-rail-muted hover:bg-mt-rail-hover hover:text-mt-rail-strong'}
      `}
    >
      {icon}
      {label}
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────
export function SidebarClient({ projects, sprintName, isAdmin }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { revealed, toggle } = useProjectPrivacy();

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
      {/* ── Mobile hamburger: opaque so it reads on the paper and the green header ── */}
      <button
        type="button"
        aria-label="Abrir menu"
        aria-expanded={mobileOpen}
        aria-controls="sidebar-nav"
        onClick={() => setMobileOpen(true)}
        className="btn btn-secondary md:hidden fixed left-3 top-2 z-30 !size-10 !p-0"
      >
        <Menu size={18} strokeWidth={2} aria-hidden="true" />
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
          on-rail sidebar-drawer md:transform-none
          ${mobileOpen ? 'open' : ''}
          fixed md:static top-0 left-0 z-50 md:z-auto
          w-60 h-full md:h-auto shrink-0
          border-r border-mt-rail-line
          bg-mt-rail text-mt-rail-text
          flex flex-col
        `}
      >
        {/* Brand header */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-mt-rail-line pl-4 pr-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-beige.png" alt="" width={14} height={22} />
          <span className="mr-auto select-none text-[16px] font-bold tracking-[-0.02em] text-mt-rail-strong">
            martrello
          </span>
          <button
            type="button"
            onClick={toggle}
            aria-pressed={revealed}
            aria-label={revealed ? 'Esconder nomes reais dos projetos' : 'Mostrar nomes reais dos projetos'}
            title={revealed ? 'Esconder nomes reais' : 'Mostrar nomes reais'}
            className="btn !p-1.5 text-mt-rail-muted hover:bg-mt-rail-hover hover:text-mt-rail-strong"
          >
            {revealed
              ? <Eye size={16} strokeWidth={1.75} aria-hidden="true" />
              : <EyeOff size={16} strokeWidth={1.75} aria-hidden="true" />
            }
          </button>
          {/* Mobile close */}
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={closeDrawer}
            className="btn md:hidden !p-1.5 text-mt-rail-muted hover:bg-mt-rail-hover hover:text-mt-rail-strong"
          >
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 text-[13.5px]">
          {/* Sprint link */}
          <Link
            href={sprintHref}
            aria-current={isSprintActive ? 'page' : undefined}
            className={`
              flex items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 font-semibold no-underline
              transition-colors duration-[var(--duration-fast)] ease-out
              ${isSprintActive
                ? 'bg-mt-rail-active text-mt-rail-strong'
                : 'text-mt-rail-text hover:bg-mt-rail-hover hover:text-mt-rail-strong'
              }
            `}
          >
            <Zap size={15} strokeWidth={1.75} className="shrink-0 text-ax-green-400" aria-hidden="true" />
            <span className="truncate">
              {!sprintName && 'Sprint atual'}
              {sprintName && /^sprint\b/i.test(sprintName) && sprintName}
              {sprintName && !/^sprint\b/i.test(sprintName) && (
                <>Sprint <span aria-hidden="true" className="font-medium text-mt-rail-muted">//</span> {sprintName}</>
              )}
            </span>
          </Link>

          {/* Projects section */}
          <div className="label-caps px-2.5 pb-1.5 pt-5 text-mt-rail-muted">Projetos</div>

          {projects.length === 0 && (
            <p className="px-2.5 py-2 text-[13px] text-mt-rail-muted">Nenhum projeto ainda.</p>
          )}

          <div className="flex flex-col gap-0.5">
            {projects.map((p) => {
              const href = `/project/${p.id}`;
              const isActive = pathname === href;
              return (
                <Link
                  key={p.id}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                    flex items-center justify-between gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 no-underline
                    transition-colors duration-[var(--duration-fast)] ease-out
                    ${isActive
                      ? 'bg-mt-rail-active font-semibold text-mt-rail-strong'
                      : 'font-medium text-mt-rail-text hover:bg-mt-rail-hover hover:text-mt-rail-strong'
                    }
                  `}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ProjectDot color={p.color} />
                    <span className="truncate">{revealed ? p.name : p.acronym}</span>
                  </span>
                  <span className="shrink-0 text-[12px] font-medium text-mt-rail-muted">{p.cardCount}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Footer: account links + logout */}
        <div className="flex flex-col gap-0.5 border-t border-mt-rail-line p-2 pb-0 text-[13.5px]">
          {isAdmin && <FooterLink href="/admin" label="Admin" icon={<Shield size={14} strokeWidth={1.75} aria-hidden="true" />} active={pathname === '/admin'} />}
          <FooterLink href="/conta" label="Minha conta" icon={<User size={14} strokeWidth={1.75} aria-hidden="true" />} active={pathname === '/conta'} />
        </div>
        <form action={logoutAction} className="p-2 pt-0.5">
          <button
            type="submit"
            className="btn w-full !justify-start text-mt-rail-muted hover:bg-mt-rail-hover hover:text-mt-rail-strong"
          >
            <LogOut size={14} strokeWidth={1.75} aria-hidden="true" />
            Sair
          </button>
        </form>
      </aside>
    </>
  );
}
