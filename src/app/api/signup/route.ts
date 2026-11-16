import { getDb } from '@/lib/db';
import { setSessionCookie } from '@/lib/session-cookie';
import { handleSignup } from '@/lib/signup-request';

export async function POST(request: Request) {
  const out = await handleSignup(request, getDb());
  const response = Response.json(out.body, { status: out.status });
  if (out.token) await setSessionCookie(out.token);
  return response;
}
