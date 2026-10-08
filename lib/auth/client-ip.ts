// Trusts proxy headers: in production the app is only reachable through Easypanel's Traefik.
export function clientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const real = headers.get('x-real-ip')?.trim();
  if (real) return real;
  return 'unknown';
}
