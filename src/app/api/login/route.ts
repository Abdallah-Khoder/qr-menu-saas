import { cookies } from 'next/headers';
import { getDb } from '@/lib/db';
import { handleLogin } from '@/lib/login-request';
import { SESSION_COOKIE, SESSION_DAYS } from '@/lib/session';

export async function POST(request: Request) {
  const out = await handleLogin(request, getDb());
  const response = Response.json(out.body, { status: out.status });
  if (out.token) {
    (await cookies()).set(SESSION_COOKIE, out.token, {
      httpOnly: true, // JavaScript in the page cannot read it
      secure: process.env.NODE_ENV === 'production', // only over https when deployed
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    });
  }
  return response;
}
