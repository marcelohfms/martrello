'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/current-user';
import { createInvite, resendInvite, cancelInvite, listPendingInvites } from '@/lib/auth/tokens';
import { deactivateUser, reactivateUser } from '@/lib/auth/admin-users';
import { addMember, removeMember } from '@/lib/core/members';
import { sendEmail, appUrl } from '@/lib/email/mailer';
import { inviteEmail } from '@/lib/email/templates';
import { validateInviteInput } from '@/lib/auth/admin-input';
import { toResult } from '@/lib/action-result';

export type AdminResult = { ok: true } | { error: string };
export type InviteResult = { ok: true; link?: string; warning?: string } | { error: string };

const SEND_WARNING = 'Não foi possível enviar o e-mail. Copie o link e envie para a pessoa.';

/** Emails the invite; without a mail provider (or when sending fails) the link is handed back to be copied. */
async function deliverInvite(email: string, name: string, token: string): Promise<InviteResult> {
  const link = appUrl('/convite/' + token);
  try {
    const status = await sendEmail({ to: email, ...inviteEmail({ name, link }) });
    return status === 'disabled' ? { ok: true, link } : { ok: true };
  } catch {
    return { ok: true, link, warning: SEND_WARNING };
  }
}

export async function inviteAction(input: { email: string; name: string }): Promise<InviteResult> {
  const { actor } = await requireAdmin();
  const v = validateInviteInput(input);
  if ('error' in v) return v;
  try {
    const { token } = await createInvite(getDb(), actor, { email: v.email, name: v.name });
    const res = await deliverInvite(v.email, v.name, token);
    revalidatePath('/admin');
    return res;
  } catch (e) {
    return toResult(e);
  }
}

export async function resendInviteAction(inviteId: string): Promise<InviteResult> {
  const { actor } = await requireAdmin();
  try {
    const db = getDb();
    const pending = (await listPendingInvites(db, actor)).find(
      (i) => i.inviteId === inviteId,
    );
    const { token } = await resendInvite(db, actor, inviteId);
    const res = pending ? await deliverInvite(pending.email, pending.name, token) : { ok: true as const, link: appUrl('/convite/' + token) };
    revalidatePath('/admin');
    return res;
  } catch (e) {
    return toResult(e);
  }
}

async function run(fn: (actor: Awaited<ReturnType<typeof requireAdmin>>['actor']) => Promise<void>): Promise<AdminResult> {
  const { actor } = await requireAdmin();
  try {
    await fn(actor);
    revalidatePath('/admin');
    revalidatePath('/');
    return { ok: true };
  } catch (e) {
    return toResult(e);
  }
}

export async function cancelInviteAction(inviteId: string): Promise<AdminResult> {
  return run((actor) => cancelInvite(getDb(), actor, inviteId));
}

export async function deactivateUserAction(userId: string): Promise<AdminResult> {
  return run((actor) => deactivateUser(getDb(), actor, userId));
}

export async function reactivateUserAction(userId: string): Promise<AdminResult> {
  return run((actor) => reactivateUser(getDb(), actor, userId));
}

export async function addMemberAction(projectId: string, userId: string): Promise<AdminResult> {
  return run((actor) => addMember(getDb(), actor, projectId, userId));
}

export async function removeMemberAction(projectId: string, userId: string): Promise<AdminResult> {
  return run((actor) => removeMember(getDb(), actor, projectId, userId));
}
