import { z } from 'zod';
import { EMAIL_MAX, OWNER_PASSWORD_MIN, PASSWORD_MAX, checkOwnerPassword } from './credentials.mjs';
import type { Db } from './db';
import type { Mail } from './email';
import { isJsonRequest } from './json-request';
import { createResetMail, resetPassword } from './password-reset';
import { releaseAttempts, reserveAttempt } from './rate-limit';

export type ResetResponse = { status: number; body: { error?: string; ok?: boolean; redirect?: string } };

const TOO_MANY: ResetResponse = { status: 429, body: { error: 'عدد المحاولات كبير. يُرجى المحاولة بعد 15 دقيقة.' } };
const bad = (error: string): ResetResponse => ({ status: 400, body: { error } });
const ipOf = (request: Request) => request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';

async function readJson(request: Request): Promise<unknown | ResetResponse> {
  if (!isJsonRequest(request)) return { status: 415, body: { error: 'نوع الطلب غير مقبول' } } satisfies ResetResponse;
  try {
    return await request.json();
  } catch {
    return bad('طلب غير صالح');
  }
}
const isResponse = (x: unknown): x is ResetResponse => typeof x === 'object' && x !== null && 'status' in x && 'body' in x;

const ForgotBody = z.object({ email: z.string().max(EMAIL_MAX) });

/**
 * "I forgot my password". The answer is ALWAYS the same "ok", whether the email is registered or not, so this
 * page cannot be used to find out who has an account. The mail is handed to `send` (the route sends it AFTER the
 * answer, so the time taken does not depend on whether a mail was sent either).
 * Every request counts against a limit (per address and per email), also the ones that send nothing.
 */
export async function handleForgot(request: Request, db: Db, send: (mail: Mail) => void | Promise<void>): Promise<ResetResponse> {
  const json = await readJson(request);
  if (isResponse(json)) return json;
  const parsed = ForgotBody.safeParse(json);
  if (!parsed.success) return bad('طلب غير صالح');
  const email = parsed.data.email.trim().toLowerCase();

  const slot = await reserveAttempt(db, [`forgot:ip:${ipOf(request)}`, `forgot:email:${email}`]);
  if (!slot.allowed) return TOO_MANY; // the attempt stays counted: asking again and again does not reset the clock

  const mail = await createResetMail(db, email);
  if (mail) {
    try {
      await send(mail);
    } catch (e) {
      console.error('Reset email failed:', e instanceof Error ? e.message : e); // never shown: it would reveal the account exists
    }
  }
  return { status: 200, body: { ok: true } };
}

const ResetBody = z.object({ token: z.string().min(1).max(200), password: z.string().max(1000) });

/** "Here is my new password" (with the secret token from the mail). */
export async function handleReset(request: Request, db: Db): Promise<ResetResponse> {
  const json = await readJson(request);
  if (isResponse(json)) return json;
  const parsed = ResetBody.safeParse(json);
  if (!parsed.success) return bad('طلب غير صالح');

  // Mistakes in the form do not count against the limit: only guessing links does.
  const problem = checkOwnerPassword(parsed.data.password);
  if (problem === 'short') return bad(`كلمة المرور قصيرة جدًا (${OWNER_PASSWORD_MIN} أحرف على الأقل)`);
  if (problem === 'long') return bad(`كلمة المرور طويلة جدًا (بحد أقصى ${PASSWORD_MAX} حرف)`);

  const slot = await reserveAttempt(db, [`reset:ip:${ipOf(request)}`]);
  if (!slot.allowed) return TOO_MANY;

  const result = await resetPassword(db, parsed.data.token, parsed.data.password);
  if (!result.ok) return bad('الرابط غير صالح أو منتهي الصلاحية. اطلب رابطًا جديدًا.');
  try {
    await releaseAttempts(db, slot.ids);
  } catch (e) {
    console.error('reset: could not release the attempt counter', e);
  }
  // No automatic login: he logs in with the new password (the old logins are already dead).
  return { status: 200, body: { redirect: '/login?reset=1' } };
}
