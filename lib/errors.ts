export type ErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'LIST_NOT_FOUND'
  | 'CARD_NOT_FOUND'
  | 'LABEL_NOT_FOUND'
  | 'SPRINT_NOT_FOUND'
  | 'INVALID_DATE'
  | 'SPRINT_ALREADY_ACTIVE'
  | 'NO_ACTIVE_SPRINT'
  | 'LIST_NOT_IN_PROJECT'
  | 'LIST_NOT_EMPTY'
  | 'NAME_CONFLICT'
  | 'INVALID_INPUT';

export class MartrelloError extends Error {
  public readonly originalMessage: string;

  constructor(
    public code: ErrorCode,
    message: string,
    public suggestions?: string[],
  ) {
    super(`${code}: ${message}`);
    this.name = 'MartrelloError';
    this.originalMessage = message;
  }

  toJSON() {
    const base: { error: ErrorCode; message: string; suggestions?: string[] } = {
      error: this.code,
      message: this.originalMessage,
    };
    if (this.suggestions && this.suggestions.length > 0) base.suggestions = this.suggestions;
    return base;
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function suggestClosest(needle: string, candidates: string[], max = 3, threshold = 0.6): string[] {
  const n = needle.toLowerCase();
  return candidates
    .map((c) => ({ c, d: levenshtein(n, c.toLowerCase()), len: Math.max(n.length, c.length) }))
    .filter((x) => x.d / x.len <= threshold)
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.c);
}
