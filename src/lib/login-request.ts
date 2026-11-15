import { z } from 'zod';
import type { Db } from './db';
import { login } from './login';
import { createSessionToken } from './session';

const Body = z.object({ email: z.string().max(254), password: z.string().min(1).max(200) });

export type LoginResponse = {
  status: number;
  body: { error?: string; redirect?: string };
  token?: string;
};

/** Pure request logic (no cookies here) so tests can run it without Next. */
export async function handleLogin(request: Request, db: Db): Promise<LoginResponse> {
  // A form on another website cannot send JSON with this header, which blocks cross-site posts.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return { status: 415, body: { error: 'نوع الطلب غير مقبول' } };
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { status: 400, body: { error: 'طلب غير صالح' } };
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return { status: 400, body: { error: 'طلب غير صالح' } };

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const result = await login(db, parsed.data.email, parsed.data.password, ip);

  if (!result.ok && result.reason === 'rate_limited') {
    return { status: 429, body: { error: 'محاولات كثيرة. جرّب بعد 15 دقيقة.' } };
  }
  if (!result.ok) {
    return { status: 401, body: { error: 'الإيميل أو كلمة السر غير صحيحة' } };
  }
  return {
    status: 200,
    body: { redirect: result.user.role === 'super_admin' ? '/admin' : '/dashboard' },
    token: await createSessionToken(result.user.id),
  };
}
