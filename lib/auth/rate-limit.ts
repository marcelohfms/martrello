export type RateLimitCheck = { allowed: true } | { allowed: false; retryAfterMs: number };

type Entry = { failures: number[]; blockedUntil: number };

export function createRateLimiter(opts: {
  maxFailures: number;
  windowMs: number;
  blockMs: number;
  now?: () => number;
}) {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, Entry>();

  function fresh(key: string): Entry | undefined {
    const e = entries.get(key);
    if (!e) return undefined;
    const t = now();
    e.failures = e.failures.filter((ts) => t - ts < opts.windowMs);
    if (e.blockedUntil <= t && e.failures.length === 0) {
      entries.delete(key);
      return undefined;
    }
    return e;
  }

  return {
    check(key: string): RateLimitCheck {
      const e = fresh(key);
      const t = now();
      if (e && e.blockedUntil > t) return { allowed: false, retryAfterMs: e.blockedUntil - t };
      return { allowed: true };
    },
    recordFailure(key: string): void {
      const t = now();
      const e = fresh(key) ?? { failures: [], blockedUntil: 0 };
      e.failures.push(t);
      if (e.failures.length >= opts.maxFailures) {
        e.blockedUntil = t + opts.blockMs;
        e.failures = [];
      }
      entries.set(key, e);
    },
    reset(key: string): void {
      entries.delete(key);
    },
  };
}

const FIFTEEN_MIN = 15 * 60 * 1000;

export const loginLimiter = createRateLimiter({ maxFailures: 5, windowMs: FIFTEEN_MIN, blockMs: FIFTEEN_MIN });
