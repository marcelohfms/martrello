import { getDb } from '@/lib/db/client';
import { requireActor } from '@/lib/auth/current-user';
import { listMcpTokens } from '@/lib/auth/mcp-tokens';
import { McpTokensSection } from './McpTokensSection';
import { PasswordSection } from './PasswordSection';

export default async function ContaPage() {
  const { user } = await requireActor();
  const tokens = await listMcpTokens(getDb(), user.id);

  return (
    <div className="h-dvh flex flex-col bg-mt-bg">
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-mt-line bg-mt-card pl-16 pr-4 md:px-6">
        <h1 className="text-[18px] font-bold tracking-[-0.02em] text-mt-heading">Minha conta</h1>
        <span className="ml-auto truncate text-[13px] font-medium text-mt-muted">{user.name} <span aria-hidden="true">//</span> {user.email}</span>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-10">
          <McpTokensSection
            tokens={tokens.filter((t) => t.revokedAt === null).map((t) => ({ id: t.id, name: t.name, createdAt: t.createdAt, lastUsedAt: t.lastUsedAt }))}
          />
          <PasswordSection />
        </div>
      </div>
    </div>
  );
}
