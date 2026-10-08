export const SESSION_COOKIE = 'martrello_session';

export function sessionCookieOptions(expiresAt: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    expires: new Date(expiresAt),
  };
}
