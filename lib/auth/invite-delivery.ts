import { sendEmail, appUrl } from '@/lib/email/mailer';
import { inviteEmail } from '@/lib/email/templates';

export type InviteResult = { ok: true; link?: string; warning?: string } | { error: string };

export const SEND_WARNING = 'Não foi possível enviar o e-mail. Copie o link e envie para a pessoa.';

/** Emails the invite; without a mail provider (or when sending fails) the link is handed back to be copied. */
export async function deliverInvite(email: string, name: string, token: string): Promise<InviteResult> {
  const link = appUrl('/convite/' + token);
  try {
    const status = await sendEmail({ to: email, ...inviteEmail({ name, link }) });
    return status === 'disabled' ? { ok: true, link } : { ok: true };
  } catch {
    return { ok: true, link, warning: SEND_WARNING };
  }
}
