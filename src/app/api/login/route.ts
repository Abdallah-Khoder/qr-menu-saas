import { getDb } from '@/lib/db';
import { handleLogin } from '@/lib/login-request';
import { setSessionCookie } from '@/lib/session-cookie';

export async function POST(request: Request) {
  const out = await handleLogin(request, getDb());
  const response = Response.json(out.body, { status: out.status });
  if (out.token) await setSessionCookie(out.token);
  return response;
}
