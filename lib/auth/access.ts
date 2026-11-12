export type AccessDecision = 'allow' | 'redirect-login' | 'redirect-home' | 'unauthorized';

function isMcpEndpoint(pathname: string): boolean {
  return pathname === '/api/mcp' || pathname.startsWith('/api/mcp/');
}

function isPublicAuthPage(pathname: string): boolean {
  return (
    pathname === '/esqueci-senha' ||
    pathname.startsWith('/convite/') ||
    pathname.startsWith('/redefinir-senha/')
  );
}

export function decideAccess(pathname: string, authenticated: boolean): AccessDecision {
  if (isMcpEndpoint(pathname)) return 'allow';
  if (isPublicAuthPage(pathname)) return 'allow';
  if (pathname === '/login') return authenticated ? 'redirect-home' : 'allow';
  if (authenticated) return 'allow';
  if (pathname.startsWith('/api/')) return 'unauthorized';
  return 'redirect-login';
}
