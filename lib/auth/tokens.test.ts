import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb, makeUser, type Db } from '@/lib/core/test-helpers';
import { createUser, authenticate } from './users';
import { createSession, validateSession } from './sessions';
import { users, authTokens } from '@/lib/db/schema';
import {
  INVITE_TTL_MS, RESET_TTL_MS, createInvite, resendInvite, cancelInvite, listPendingInvites,
  peekToken, acceptInvite, requestPasswordReset, resetPassword,
} from './tokens';

let db: Db;
let close: () => void;
beforeEach(() => {
  const t = makeTestDb();
  db = t.db;
  close = t.close;
});

const PW = 'uma-senha-bem-longa';
const T0 = 1_700_000_000_000;

describe('convites', () => {
  it('aceitar convite cria membro e o link não funciona de novo', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: ' Ana@T.local ', name: 'Ana' }, T0);
    expect(await peekToken(db, 'invite', token, T0)).toEqual({ email: 'ana@t.local', name: 'Ana' });
    const u = await acceptInvite(db, token, PW, T0 + 1000);
    expect(u).toMatchObject({ email: 'ana@t.local', name: 'Ana', role: 'member' });
    expect(await authenticate(db, 'ana@t.local', PW)).not.toBeNull();
    await expect(acceptInvite(db, token, PW, T0 + 2000)).rejects.toThrow(/TOKEN_INVALID/);
    expect(await peekToken(db, 'invite', token, T0 + 2000)).toBeNull();
    close();
  });

  it('convite expira em 7 dias', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    await expect(acceptInvite(db, token, PW, T0 + INVITE_TTL_MS + 1)).rejects.toThrow(/TOKEN_INVALID/);
    expect(await peekToken(db, 'invite', token, T0 + INVITE_TTL_MS - 1)).not.toBeNull();
    close();
  });

  it('reenviar invalida o link anterior', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const first = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    const second = await resendInvite(db, admin.actor, first.inviteId, T0 + 5000);
    await expect(acceptInvite(db, first.token, PW, T0 + 6000)).rejects.toThrow(/TOKEN_INVALID/);
    const pending = await listPendingInvites(db, admin.actor, T0 + 6000);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ inviteId: second.inviteId, email: 'a@t.local', expiresAt: T0 + 5000 + INVITE_TTL_MS });
    await acceptInvite(db, second.token, PW, T0 + 7000);
    close();
  });

  it('convidar de novo o mesmo e-mail revoga o convite anterior', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const a = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    await createInvite(db, admin.actor, { email: 'A@t.local', name: 'A' }, T0 + 1);
    await expect(acceptInvite(db, a.token, PW, T0 + 2)).rejects.toThrow(/TOKEN_INVALID/);
    close();
  });

  it('cancelar convite o invalida', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token, inviteId } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    await cancelInvite(db, admin.actor, inviteId);
    await expect(acceptInvite(db, token, PW, T0 + 1)).rejects.toThrow(/TOKEN_INVALID/);
    expect(await listPendingInvites(db, admin.actor, T0 + 1)).toHaveLength(0);
    close();
  });

  it('convidar e-mail existente (ativo ou desativado, outra caixa) → EMAIL_TAKEN', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    await makeUser(db, { email: 'bob@t.local' });
    await expect(createInvite(db, admin.actor, { email: 'BOB@t.local', name: 'B' })).rejects.toThrow(/EMAIL_TAKEN/);
    const dis = await makeUser(db, { email: 'dis@t.local' });
    db.update(users).set({ disabledAt: 1 }).where(eq(users.id, dis.user.id)).run();
    await expect(createInvite(db, admin.actor, { email: 'dis@t.local', name: 'D' })).rejects.toThrow(/EMAIL_TAKEN/);
    close();
  });

  it('aceitar quando o e-mail já ganhou conta → EMAIL_TAKEN e não consome', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    await expect(acceptInvite(db, token, PW, T0 + 1)).rejects.toThrow(/EMAIL_TAKEN/);
    const row = db.select().from(authTokens).all()[0];
    expect(row.usedAt).toBeNull();
    close();
  });

  it('senha curta não consome o convite', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    await expect(acceptInvite(db, token, 'curta', T0 + 1)).rejects.toThrow(/INVALID_INPUT/);
    await acceptInvite(db, token, PW, T0 + 2);
    close();
  });

  it('reenviar convite revogado → TOKEN_INVALID; expirado ainda pode', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const a = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    const b = await createInvite(db, admin.actor, { email: 'b@t.local', name: 'B' }, T0);
    await cancelInvite(db, admin.actor, a.inviteId);
    await expect(resendInvite(db, admin.actor, a.inviteId, T0 + 1)).rejects.toThrow(/TOKEN_INVALID/);
    const c = await createInvite(db, admin.actor, { email: 'b@t.local', name: 'B' }, T0 + 2);
    await expect(resendInvite(db, admin.actor, b.inviteId, T0 + 3)).rejects.toThrow(/TOKEN_INVALID/);
    await resendInvite(db, admin.actor, c.inviteId, T0 + INVITE_TTL_MS + 10);
    close();
  });

  it('dois aceites concorrentes: só um passa', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    const r = await Promise.allSettled([acceptInvite(db, token, PW, T0 + 1), acceptInvite(db, token, PW, T0 + 1)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const lost = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(String(lost.reason)).toMatch(/TOKEN_INVALID/);
    close();
  });

  it('membro não convida nem lista', async () => {
    const bob = await makeUser(db);
    await expect(createInvite(db, bob.actor, { email: 'x@t.local', name: 'X' })).rejects.toThrow(/FORBIDDEN/);
    await expect(listPendingInvites(db, bob.actor)).rejects.toThrow(/FORBIDDEN/);
    await expect(resendInvite(db, bob.actor, 'x')).rejects.toThrow(/FORBIDDEN/);
    await expect(cancelInvite(db, bob.actor, 'x')).rejects.toThrow(/FORBIDDEN/);
    close();
  });

  it('token desconhecido ou de outro tipo é inválido', async () => {
    const admin = await makeUser(db, { role: 'admin' });
    const { token } = await createInvite(db, admin.actor, { email: 'a@t.local', name: 'A' }, T0);
    expect(await peekToken(db, 'invite', 'nada', T0)).toBeNull();
    expect(await peekToken(db, 'reset', token, T0)).toBeNull();
    close();
  });
});

describe('redefinição de senha', () => {
  it('reset vale 1 hora e encerra as outras sessões', async () => {
    const u = await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    const sess = await createSession(db, u.id);
    const token = await requestPasswordReset(db, 'A@t.local', T0);
    expect(token).toBeTruthy();
    expect(await peekToken(db, 'reset', token!, T0)).toEqual({ email: 'a@t.local', name: null });
    const user = await resetPassword(db, token!, 'outra-senha-longa', T0 + RESET_TTL_MS - 1);
    expect(user.id).toBe(u.id);
    expect(await validateSession(db, sess.token)).toBeNull();
    expect(await authenticate(db, 'a@t.local', 'outra-senha-longa')).not.toBeNull();
    await expect(resetPassword(db, token!, 'terceira-senha-longa', T0 + 10)).rejects.toThrow(/TOKEN_INVALID/);
    close();
  });

  it('dois resets concorrentes: só um passa', async () => {
    await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    const token = await requestPasswordReset(db, 'a@t.local', T0);
    const r = await Promise.allSettled([
      resetPassword(db, token!, 'outra-senha-longa', T0 + 1),
      resetPassword(db, token!, 'outra-senha-longa', T0 + 1),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const lost = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(String(lost.reason)).toMatch(/TOKEN_INVALID/);
    close();
  });

  it('reset expira após 1 hora', async () => {
    await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    const token = await requestPasswordReset(db, 'a@t.local', T0);
    await expect(resetPassword(db, token!, 'outra-senha-longa', T0 + RESET_TTL_MS + 1)).rejects.toThrow(/TOKEN_INVALID/);
    close();
  });

  it('senha curta no reset não consome o token', async () => {
    await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    const token = await requestPasswordReset(db, 'a@t.local', T0);
    await expect(resetPassword(db, token!, 'curta', T0 + 1)).rejects.toThrow(/INVALID_INPUT/);
    await resetPassword(db, token!, 'outra-senha-longa', T0 + 2);
    close();
  });

  it('requestPasswordReset de e-mail inexistente ou desativado devolve null', async () => {
    expect(await requestPasswordReset(db, 'nao@t.local')).toBeNull();
    const u = await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    db.update(users).set({ disabledAt: 1 }).where(eq(users.id, u.id)).run();
    expect(await requestPasswordReset(db, 'a@t.local')).toBeNull();
    close();
  });

  it('novo pedido revoga reset anterior não usado', async () => {
    await createUser(db, { email: 'a@t.local', name: 'A', password: PW });
    const t1 = await requestPasswordReset(db, 'a@t.local', T0);
    const t2 = await requestPasswordReset(db, 'a@t.local', T0 + 1);
    await expect(resetPassword(db, t1!, 'outra-senha-longa', T0 + 2)).rejects.toThrow(/TOKEN_INVALID/);
    await resetPassword(db, t2!, 'outra-senha-longa', T0 + 3);
    close();
  });
});
