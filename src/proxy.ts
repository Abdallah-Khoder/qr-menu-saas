import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// A QUICK check only: is there a session cookie at all? (No database here, no signature check.)
// The real checks happen in the pages (requireSuperAdmin / requireOwner) and in the data functions.
export function proxy(request: NextRequest) {
  const hasCookie = request.cookies.has('session');
  if (!hasCookie) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*'],
};
