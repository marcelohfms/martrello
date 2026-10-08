import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db/client';
import { validateSession } from '@/lib/auth/sessions';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { decideAccess } from '@/lib/auth/access';

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = '';
  return NextResponse.redirect(url);
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await validateSession(getDb(), token) : null;

  switch (decideAccess(request.nextUrl.pathname, user !== null)) {
    case 'allow':
      return NextResponse.next();
    case 'redirect-home':
      return redirectTo(request, '/');
    case 'redirect-login':
      return redirectTo(request, '/login');
    case 'unauthorized':
      return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
