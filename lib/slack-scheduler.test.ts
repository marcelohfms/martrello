import { describe, it, expect, vi, afterEach } from 'vitest';

const runTick = vi.fn();
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/slack/digest-runner', () => ({ runDigestTick: (...a: unknown[]) => runTick(...a) }));

import { startSlackScheduler } from './slack-scheduler';

const MIN = 60 * 1000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  runTick.mockReset();
});

function enable() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
  vi.stubEnv('APP_URL', 'https://martrello.test');
}

describe('startSlackScheduler', () => {
  it('não inicia fora de produção ou sem token', async () => {
    vi.useFakeTimers();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-test');
    startSlackScheduler();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SLACK_BOT_TOKEN', '');
    startSlackScheduler();
    await vi.advanceTimersByTimeAsync(30 * MIN);
    expect(runTick).not.toHaveBeenCalled();
  });

  it('roda já e a cada 15 minutos', async () => {
    vi.useFakeTimers();
    enable();
    runTick.mockResolvedValue({ sent: 0, empty: 0, failed: 0, retry: 0 });
    startSlackScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(runTick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(runTick).toHaveBeenCalledTimes(2);
    const deps = runTick.mock.calls[0][2];
    expect(deps.boardUrl('p1')).toBe('https://martrello.test/project/p1');
  });

  it('não sobrepõe ticks', async () => {
    vi.useFakeTimers();
    enable();
    runTick.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ sent: 0, empty: 0, failed: 0, retry: 0 }), 20 * MIN)),
    );
    startSlackScheduler();
    await vi.advanceTimersByTimeAsync(15 * MIN);
    expect(runTick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5 * MIN);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    expect(runTick).toHaveBeenCalledTimes(2);
  });

  it('registra o erro com [slack] e não derruba o processo', async () => {
    vi.useFakeTimers();
    enable();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    runTick.mockRejectedValue(new Error('database is locked'));
    startSlackScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/^\[slack\] falhou: .*database is locked/));
  });
});
