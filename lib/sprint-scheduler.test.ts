import { describe, it, expect, vi, afterEach } from 'vitest';

const rollover = vi.fn();
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/lib/core/sprint', () => ({ rolloverAllSprints: (...a: unknown[]) => rollover(...a) }));

import { startSprintScheduler } from './sprint-scheduler';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  rollover.mockReset();
});

describe('startSprintScheduler', () => {
  it('roda já e depois a cada 15 minutos', async () => {
    vi.useFakeTimers();
    rollover.mockResolvedValue(1);
    startSprintScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(rollover).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
    expect(rollover).toHaveBeenCalledTimes(2);
  });

  it('registra o erro com [sprint] e não derruba o processo', async () => {
    vi.useFakeTimers();
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    rollover.mockRejectedValue(new Error('no such column: user_id'));
    startSprintScheduler();
    await vi.advanceTimersByTimeAsync(0);
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/^\[sprint\] .*no such column: user_id/));
  });
});
