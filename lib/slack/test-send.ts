// Envio de teste pedido pelo admin: a mensagem de hoje, fora da janela e sem contar como o envio do dia.
import type { Db } from '@/lib/core/test-helpers';
import type { Actor } from '@/lib/access/actor';
import { assertAdmin } from '@/lib/access/guard';
import { getProject } from '@/lib/core/projects';
import { saoPauloClock } from '@/lib/core/week';
import { MartrelloError } from '@/lib/errors';
import type { SlackClient } from './client';
import { composeDigestText, mentionResolver } from './digest-runner';

export type TestSendResult = { result: 'sent' | 'empty'; channelName: string };

/** Throws MartrelloError (FORBIDDEN, PROJECT_NOT_FOUND, SLACK_NO_CHANNEL) or SlackError. Never touches slack_deliveries. */
export async function sendTestDigest(
  db: Db,
  actor: Actor,
  projectId: string,
  now: Date,
  deps: { slack: SlackClient; boardUrl: (projectId: string) => string; log?: (msg: string) => void },
): Promise<TestSendResult> {
  assertAdmin(actor);
  const project = await getProject(db, actor, projectId);
  if (!project.slackChannelId) {
    throw new MartrelloError('SLACK_NO_CHANNEL', 'Escolha um canal do Slack para o projeto antes de enviar o teste.');
  }
  const channelName = project.slackChannelName ?? project.slackChannelId;
  const { date } = saoPauloClock(now);
  const resolveId = mentionResolver(deps.slack, deps.log ?? console.log);
  const text = await composeDigestText(db, project, date, resolveId, deps.boardUrl);
  if (text === null) return { result: 'empty', channelName };
  await deps.slack.postMessage(project.slackChannelId, text);
  return { result: 'sent', channelName };
}
