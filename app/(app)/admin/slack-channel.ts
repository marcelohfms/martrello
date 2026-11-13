import type { ProjectDeliveryStatus } from '@/lib/core/slack-deliveries';

export type SlackChannel = { id: string; name: string };
export type SlackSetup =
  | { state: 'off' }
  | { state: 'error'; message: string }
  | { state: 'ok'; channels: SlackChannel[] };

export function channelOptions(
  saved: SlackChannel | null,
  channels: SlackChannel[],
): { id: string; label: string; unavailable: boolean }[] {
  const opts = channels.map((c) => ({ id: c.id, label: `#${c.name}`, unavailable: false }));
  if (saved && !channels.some((c) => c.id === saved.id)) {
    opts.unshift({ id: saved.id, label: `#${saved.name} (indisponível)`, unavailable: true });
  }
  return opts;
}

const REASONS: Record<string, string> = {
  not_in_channel: 'o bot não está no canal',
  channel_not_found: 'canal não encontrado',
  invalid_auth: 'token do Slack inválido',
  account_inactive: 'token do Slack inválido',
  interrupted: 'envio interrompido',
  ambiguous: 'sem confirmação do Slack',
};

const TZ = 'America/Sao_Paulo';

function stamp(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? '';
  return `${p('day')}/${p('month')} ${Number(p('hour'))}h${p('minute')}`;
}

export function formatDeliveryStatus(s: ProjectDeliveryStatus | undefined, now: Date): string {
  void now;
  if (!s || !s.latest) return 'Nenhum envio ainda';
  const { latest, lastSentAt } = s;
  const when = stamp(latest.at);
  const last = lastSentAt !== null ? ` · último envio ${stamp(lastSentAt)}` : '';
  const reason = latest.error ? (REASONS[latest.error] ?? latest.error) : 'erro desconhecido';
  switch (latest.status) {
    case 'sent':
      return `Enviado em ${when}`;
    case 'empty':
      return `${when}: nada a avisar${last}`;
    case 'retry':
      return `Erro em ${when}: ${reason} (tenta de novo até 12h)`;
    case 'failed':
      return `Erro em ${when}: ${reason}${last}`;
    default:
      return `Enviando em ${when}…`;
  }
}
