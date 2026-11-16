import { z } from 'zod';
import { PASSWORD_MAX, checkOwnerPassword, OWNER_PASSWORD_MIN } from './credentials.mjs';
import type { Db } from './db';
import { isJsonRequest } from './json-request';
import { releaseAttempts, reserveAttempt } from './rate-limit';
import { createSessionToken } from './session';
import { signUpOwner } from './signup';
import { hasLetterOrDigit } from './slugify';

export const NAME_MAX = 80;

const Body = z.object({
  token: z.string().min(1).max(200),
  name: z.string().max(400),
  password: z.string().max(1000),
});

export type SignupResponse = {
  status: number;
  body: { error?: string; redirect?: string };
  token?: string;
};

const bad = (error: string): SignupResponse => ({ status: 400, body: { error } });

/** Pure request logic (no cookies here) so tests can run it without Next. */
export async function handleSignup(request: Request, db: Db): Promise<SignupResponse> {
  if (!isJsonRequest(request)) return { status: 415, body: { error: 'نوع الطلب غير مقبول' } };
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return bad('طلب غير صالح');
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return bad('طلب غير صالح');

  // Mistakes in the form do not count against the limit: only guessing links does.
  const name = parsed.data.name.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > NAME_MAX) return bad(`اسم المطعم مطلوب (بحد أقصى ${NAME_MAX} حرفًا)`);
  if (!hasLetterOrDigit(name)) return bad('اسم المطعم يجب أن يحتوي على حرف أو رقم واحد على الأقل');
  const passwordProblem = checkOwnerPassword(parsed.data.password);
  if (passwordProblem === 'short') return bad(`كلمة المرور قصيرة جدًا (${OWNER_PASSWORD_MIN} أحرف على الأقل)`);
  if (passwordProblem === 'long') return bad(`كلمة المرور طويلة جدًا (بحد أقصى ${PASSWORD_MAX} حرف)`);

  // Someone guessing links would send many different tokens from one place: limit that.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const slot = await reserveAttempt(db, [`signup:ip:${ip}`]);
  if (!slot.allowed) {
    return { status: 429, body: { error: 'عدد المحاولات كبير. يُرجى المحاولة بعد 15 دقيقة.' } };
  }

  const result = await signUpOwner(db, { token: parsed.data.token, name, password: parsed.data.password });
  if (!result.ok) return { status: 400, body: { error: 'الرابط غير صالح' } };

  // The account already exists: a failed cleanup of the attempt counter must not turn this into an error.
  // (A leftover attempt row simply expires by itself.)
  try {
    await releaseAttempts(db, slot.ids);
  } catch (e) {
    console.error('signup: could not release the attempt counter', e);
  }
  return { status: 200, body: { redirect: '/dashboard' }, token: await createSessionToken(result.userId) };
}
