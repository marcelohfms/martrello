'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db/client';
import { requireAdmin } from '@/lib/auth/current-user';
import { createInvite, resendInvite, cancelInvite, listPendingInvites } from '@/lib/auth/tokens';
import { deactivateUser, reactivateUser } from '@/lib/auth/admin-users';
import { addMember, removeMember } from '@/lib/core/members';
import { setProjectSlackChannel } from '@/lib/core/projects';
import { deliverInvite, inviteLink, inviteLinkPreflight, type InviteResult } from '@/lib/auth/invite-delivery';
import { validateInviteInput } from '@/lib/auth/admin-input';
import { toResult, type ActionResult } from '@/lib/action-result';
import { createSlackClient, SlackError } from '@/lib/slack/client';
import { sendTestDigest } from '@/lib/slack/test-send';
import { appUrl } from '@/lib/email/mailer';
import { slackReason, testSendMessage } from './slack-channel';

type AdminResult = ActionResult;

export async function inviteAction(input: { email: string; name: string }): Promise<InviteResult> {
  const { actor } = await requireAdmin();
  const v = validateInviteInput(input);
  if ('error' in v) return v;
  const preflight = inviteLinkPreflight();
  if (preflight) return preflight;
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
  const preflight = inviteLinkPreflight();
  if (preflight) return preflight;
  try {
    const db = getDb();
    const pending = (await listPendingInvites(db, actor)).find(
      (i) => i.inviteId === inviteId,
    );
    const { token } = await resendInvite(db, actor, inviteId);
    const res = pending ? await deliverInvite(pending.email, pending.name, token) : { ok: true as const, link: inviteLink(token)! };
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

export async function setSlackChannelAction(
  projectId: string,
  channel: { id: string; name: string } | null,
): Promise<AdminResult> {
  return run((actor) => setProjectSlackChannel(getDb(), actor, projectId, channel));
}

/** Sends today's message to the project's channel now, outside the 9h–12h window, without counting as the day's send. */
export async function sendSlackTestAction(projectId: string): Promise<{ ok: true; message: string } | { error: string }> {
  const { actor } = await requireAdmin();
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { error: 'Slack não configurado.' };
  try {
    const r = await sendTestDigest(getDb(), actor, projectId, new Date(), {
      slack: createSlackClient(token),
      boardUrl: (id) => appUrl(`/project/${id}`),
    });
    return { ok: true, message: testSendMessage(r) };
  } catch (e) {
    if (e instanceof SlackError) return { error: `Erro do Slack: ${slackReason(e.code)}` };
    return toResult(e);
  }
}
