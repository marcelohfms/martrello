// Trusts proxy headers: in production the app is only reachable through Easypanel's Traefik.
// The rightmost x-forwarded-for entry is the one our single trusted proxy appends, so it is the
// only one we can trust; entries to the left are client-controlled and can be forged.
export function clientIp(headers: { get(name: string): string | null }): string {
  const entries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const forwarded = entries.at(-1);
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}
