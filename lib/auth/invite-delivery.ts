import { sendEmail, appUrl } from '@/lib/email/mailer';
import { inviteEmail } from '@/lib/email/templates';

export type InviteResult = { ok: true; link?: string; warning?: string } | { error: string };

export const SEND_WARNING = 'Não foi possível enviar o e-mail. Copie o link e envie para a pessoa.';
export const APP_URL_MISSING = 'APP_URL não configurada';

/** The invite link for `token`, or null when APP_URL is missing in production. */
export function inviteLink(token: string): string | null {
  try {
    return appUrl('/convite/' + token);
  } catch {
    return null;
  }
}

/**
 * Checked before an invite is created or its link rotated, so a missing APP_URL never leaves
 * behind an invite nobody can open.
 */
export function inviteLinkPreflight(): { error: string } | null {
  return inviteLink('') === null ? { error: APP_URL_MISSING } : null;
}

/** Emails the invite; without a mail provider (or when sending fails) the link is handed back to be copied. */
export async function deliverInvite(email: string, name: string, token: string): Promise<InviteResult> {
  const link = inviteLink(token);
  if (link === null) return { error: APP_URL_MISSING };
  try {
    const status = await sendEmail({ to: email, ...inviteEmail({ name, link }) });
    return status === 'disabled' ? { ok: true, link } : { ok: true };
  } catch {
    return { ok: true, link, warning: SEND_WARNING };
  }
}
