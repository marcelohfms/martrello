import { getDb } from '@/lib/db/client';
import { rolloverAllSprints } from '@/lib/core/sprint';

const INTERVAL_MS = 15 * 60 * 1000;

/** Opens and closes the weekly sprints: a tick now, then every 15 minutes. Never throws. */
export function startSprintScheduler(): void {
  const tick = async () => {
    try {
      await rolloverAllSprints(getDb());
    } catch (e) {
      console.error(`[sprint] falhou: ${(e as Error).message}`);
    }
  };

  void tick();
  setInterval(tick, INTERVAL_MS).unref();
}
