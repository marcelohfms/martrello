import Link from 'next/link';
import type { ReactNode } from 'react';

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main
      className="relative flex min-h-dvh flex-1 items-center justify-center bg-mt-rail bg-cover bg-center px-4"
      style={{ backgroundImage: 'url(/brand/bg-gradient-dark.webp)' }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: 'url(/brand/bg-grid-dark.webp)' }}
        aria-hidden="true"
      />
      <div className="relative flex w-full max-w-[360px] flex-col gap-4 rounded-[var(--radius-lg)] bg-mt-card p-8 shadow-raised">
        <div className="mb-2 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mark-green.png" alt="" width={20} height={31} />
          <span className="select-none text-[24px] font-extrabold tracking-[-0.02em] text-mt-heading">martrello</span>
        </div>
        {children}
      </div>
    </main>
  );
}

export function BackToLogin() {
  return (
    <Link href="/login" className="text-[13px] font-semibold text-mt-heading underline">
      Voltar para o login
    </Link>
  );
}
