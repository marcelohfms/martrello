import { describe, it, expect } from 'vitest';
import { createRateLimiter } from './rate-limit';

const MIN = 60_000;

function setup() {
  let t = 0;
  const limiter = createRateLimiter({ maxFailures: 5, windowMs: 15 * MIN, blockMs: 15 * MIN, now: () => t });
  return { limiter, advance: (ms: number) => { t += ms; } };
}

describe('rate limiter', () => {
  it('allows 5 failures, blocks the 6th attempt', () => {
    const { limiter } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
    limiter.recordFailure('ip');
    const c = limiter.check('ip');
    expect(c.allowed).toBe(false);
    if (!c.allowed) expect(c.retryAfterMs).toBe(15 * MIN);
  });

  it('unblocks after the block period', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    advance(15 * MIN);
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('failures older than the window do not count', () => {
    const { limiter, advance } = setup();
    for (let i = 0; i < 4; i++) limiter.recordFailure('ip');
    advance(15 * MIN + 1);
    limiter.recordFailure('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('reset clears failures immediately', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('ip');
    limiter.reset('ip');
    expect(limiter.check('ip')).toEqual({ allowed: true });
  });

  it('keys are independent', () => {
    const { limiter } = setup();
    for (let i = 0; i < 5; i++) limiter.recordFailure('a');
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b')).toEqual({ allowed: true });
  });
});
