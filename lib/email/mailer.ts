export type EmailMessage = { to: string; subject: string; text: string; html: string };

export async function sendEmail(msg: EmailMessage): Promise<'sent' | 'disabled'> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return 'disabled';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Resend respondeu ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`);
  }
  return 'sent';
}

export function appUrl(path: string): string {
  let raw = process.env.APP_URL;
  if (!raw) {
    if (process.env.NODE_ENV === 'production') throw new Error('APP_URL não configurada');
    raw = 'http://localhost:3000';
  }
  const base = raw.replace(/\/+$/, '');
  return `${base}${path}`;
}
