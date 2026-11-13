// Tick do bot de prazos: decide se envia, monta a mensagem, envia e registra o resultado.
import type { Db } from '@/lib/core/test-helpers';
import { saoPauloClock } from '@/lib/core/week';
import { isBusinessDay, isFirstBusinessDayOfWeek } from '@/lib/core/holidays';
import {
  claimDelivery,
  failStaleSending,
  finishDelivery,
  listDigestTargets,
} from '@/lib/core/slack-deliveries';
import { listDueCards } from '@/lib/core/due-cards';
import { buildDigest, isEmptyDigest, renderDigest } from '@/lib/core/due-digest';
import { SlackError, type SlackClient } from './client';

/** Resolves e-mails to Slack user ids, once per e-mail; a failed lookup is logged and yields null. */
export function mentionResolver(slack: SlackClient, log: (msg: string) => void): (email: string) => Promise<string | null> {
  const slackIds = new Map<string, string | null>();
  return async (email) => {
    if (slackIds.has(email)) return slackIds.get(email) ?? null;
    let id: string | null = null;
    try {
      id = await slack.lookupUserIdByEmail(email);
    } catch (e) {
      log(`[slack] busca de usuário falhou (${e instanceof SlackError ? e.code : (e as Error).message})`);
    }
    slackIds.set(email, id);
    return id;
  };
}

/** The message a project gets on `date` (São Paulo), or null when there is nothing to announce. */
export async function composeDigestText(
  db: Db,
  project: { id: string; name: string },
  date: string,
  resolveId: (email: string) => Promise<string | null>,
  boardUrl: (projectId: string) => string,
): Promise<string | null> {
  const cards = await listDueCards(db, project.id);
  const digest = buildDigest(cards, date, isFirstBusinessDayOfWeek(date));
  if (isEmptyDigest(digest)) return null;
  const slackIdByEmail = new Map<string, string>();
  const emails = new Set(
    [digest.overdue, digest.today, digest.week]
      .flat()
      .map((c) => c.assigneeEmail)
      .filter((e): e is string => !!e),
  );
  for (const email of emails) {
    const id = await resolveId(email);
    if (id) slackIdByEmail.set(email, id);
  }
  return renderDigest(digest, { projectName: project.name, today: date, boardUrl: boardUrl(project.id), slackIdByEmail });
}

export type DigestTickResult = { sent: number; empty: number; failed: number; retry: number };

export async function runDigestTick(
  db: Db,
  now: Date,
  deps: { slack: SlackClient; boardUrl: (projectId: string) => string; log?: (msg: string) => void },
): Promise<DigestTickResult> {
  const { slack, boardUrl } = deps;
  const log = deps.log ?? console.log;
  const result: DigestTickResult = { sent: 0, empty: 0, failed: 0, retry: 0 };
  const { date, hour } = saoPauloClock(now);
  if (!isBusinessDay(date) || hour < 9 || hour >= 12) return result;

  const ts = now.getTime();
  const stale = failStaleSending(db, date, ts);
  if (stale > 0) log(`[slack] envio interrompido em ${stale} projeto(s)`);

  const resolveId = mentionResolver(slack, log);

  for (const target of await listDigestTargets(db)) {
    try {
      await runTarget(target);
    } catch (e) {
      // Falha de banco isolada: a linha fica em 'sending' e o próximo tick a marca como interrompida.
      log(`[slack] ${target.name}: erro inesperado (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return result;

  async function runTarget(target: { id: string; name: string; channelId: string }): Promise<void> {
    if (!claimDelivery(db, target.id, date, ts)) return;
    let status: 'sent' | 'empty' | 'retry' | 'failed';
    let code: string | null = null;
    try {
      const text = await composeDigestText(db, target, date, resolveId, boardUrl);
      if (text === null) {
        status = 'empty';
      } else {
        await slack.postMessage(target.channelId, text);
        status = 'sent';
      }
    } catch (e) {
      if (e instanceof SlackError) {
        status = e.retryable ? 'retry' : 'failed';
        code = e.code;
      } else {
        status = 'failed';
        code = e instanceof Error ? e.message : String(e);
      }
    }
    finishDelivery(db, target.id, date, status, code, ts);
    result[status]++;
    log(`[slack] ${target.name}: ${status}${code ? ` (${code})` : ''}`);
  }
}
