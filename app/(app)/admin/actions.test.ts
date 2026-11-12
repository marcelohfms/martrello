import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/current-user', () => ({
  requireAdmin: vi.fn(async () => ({ user: {}, actor: { kind: 'user', id: 'a', role: 'admin' } })),
}));
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/tokens', () => ({
  createInvite: vi.fn(async () => ({ token: 'tok' })),
  resendInvite: vi.fn(async () => ({ token: 'tok2' })),
  cancelInvite: vi.fn(),
  listPendingInvites: vi.fn(async () => [{ inviteId: 'i1', email: 'ana@x.com', name: 'Ana' }]),
}));
vi.mock('@/lib/email/mailer', async (orig) => ({
  ...(await orig<typeof import('@/lib/email/mailer')>()),
  sendEmail: vi.fn(async () => 'disabled' as const),
}));

import { createInvite, resendInvite } from '@/lib/auth/tokens';
import { inviteAction, resendInviteAction } from './actions';

describe('convite sem APP_URL em produção', () => {
  beforeEach(() => {
    vi.mocked(createInvite).mockClear();
    vi.mocked(resendInvite).mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('APP_URL', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('inviteAction devolve o erro antes de criar o convite', async () => {
    expect(await inviteAction({ email: 'ana@x.com', name: 'Ana' })).toEqual({ error: 'APP_URL não configurada' });
    expect(createInvite).not.toHaveBeenCalled();
  });

  it('resendInviteAction devolve o erro antes de trocar o link', async () => {
    expect(await resendInviteAction('i1')).toEqual({ error: 'APP_URL não configurada' });
    expect(resendInvite).not.toHaveBeenCalled();
  });

  it('com APP_URL, cria e devolve o link', async () => {
    vi.stubEnv('APP_URL', 'https://app.test/');
    expect(await inviteAction({ email: 'ana@x.com', name: 'Ana' })).toEqual({ ok: true, link: 'https://app.test/convite/tok' });
    expect(createInvite).toHaveBeenCalledOnce();
  });
});
