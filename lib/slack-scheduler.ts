import { getDb } from '@/lib/db/client';
import { appUrl } from '@/lib/email/mailer';
import { createSlackClient } from '@/lib/slack/client';
import { runDigestTick } from '@/lib/slack/digest-runner';

const INTERVAL_MS = 15 * 60 * 1000;

/**
 * Posts the daily due-tasks message to each project's Slack channel: a tick now,
 * then every 15 minutes. Only in production with SLACK_BOT_TOKEN set. Never throws.
 */
export function startSlackScheduler(): void {
  const token = process.env.SLACK_BOT_TOKEN;
  if (process.env.NODE_ENV !== 'production' || !token) return;

  const slack = createSlackClient(token);
  const boardUrl = (id: string) => appUrl(`/project/${id}`);

  // The runner marks leftover 'sending' rows as failed at the start of every tick,
  // so ticks must never overlap.
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runDigestTick(getDb(), new Date(), { slack, boardUrl });
    } catch (e) {
      console.error(`[slack] falhou: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };

  void tick();
  setInterval(tick, INTERVAL_MS).unref();
}
