import { describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { add, makeDb } from './helpers';
import type { Mail } from '../src/lib/email';
import { hashToken } from '../src/lib/invites';
import { login } from '../src/lib/login';
import { createResetMail, getResetEmail, RESET_MINUTES, resetPassword } from '../src/lib/password-reset';
import { handleForgot, handleReset } from '../src/lib/password-reset-request';
import { hashPassword, verifyPassword } from '../src/lib/password.mjs';
import { createSessionToken, readSession } from '../src/lib/session';
import { findSessionUser } from '../src/lib/session-user';

process.env.SESSION_SECRET = 'a'.repeat(40);

const tokenFrom = (m: Mail) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

async function owner(pg: PGlite, email = 'owner@example.com', password = 'old-password-1') {
  const res = await pg.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified_at) VALUES ($1, $2, 'owner', now()) RETURNING id`,
    [email, await hashPassword(password)],
  );
  return res.rows[0].id;
}
const rows = async (pg: PGlite) => (await pg.query(`SELECT * FROM email_codes WHERE purpose = 'reset_password'`)).rows as Array<Record<string, unknown>>;
const post = (body: unknown, ip = '1.1.1.1', headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request('http://x/api/x', { method: 'POST', headers: { ...headers, 'x-forwarded-for': ip }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('createResetMail', () => {
  it('makes a mail for an owner; only the hash of the token is stored; it lasts 20 minutes', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    const mail = (await createResetMail(pg, '  Owner@Example.com '))!;
    expect(mail.to).toBe('owner@example.com');
    const token = tokenFrom(mail);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const [row] = await rows(pg);
    expect(row).toMatchObject({ user_id: id, code_hash: hashToken(token) });
    expect(JSON.stringify(row)).not.toContain(token);
    const minutes = Number(((await pg.query(`SELECT extract(epoch FROM (expires_at - now()))/60 AS m FROM email_codes`)).rows[0] as { m: string }).m);
    expect(minutes).toBeGreaterThan(RESET_MINUTES - 1);
    expect(minutes).toBeLessThanOrEqual(RESET_MINUTES);
    expect(RESET_MINUTES).toBe(20);
    expect(mail.text).toContain('20 دقيقة');
  });

  it('makes nothing for unknown emails, bad emails, unverified owners and the super admin', async () => {
    const pg = await makeDb();
    await add.superAdmin(pg, 'boss@example.com');
    await pg.query(`UPDATE users SET email_verified_at = now() WHERE email = 'boss@example.com'`); // verified: only his ROLE keeps him out
    await pg.query(`INSERT INTO users (email, password_hash, role) VALUES ('new@example.com', 'x', 'owner')`); // never verified
    for (const email of ['nobody@example.com', 'not-an-email', '', 'boss@example.com', 'new@example.com', "x'; DROP TABLE users;--@a.com"]) {
      expect(await createResetMail(pg, email), email).toBeNull();
    }
    expect(await rows(pg)).toHaveLength(0);
  });

  it('a new link cancels the older one (one live link per person)', async () => {
    const pg = await makeDb();
    await owner(pg);
    const first = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    const second = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    expect(await rows(pg)).toHaveLength(1);
    expect(await getResetEmail(pg, first)).toBeNull();
    expect(await getResetEmail(pg, second)).toBe('owner@example.com');
  });
});

describe('createResetMail when the mail cannot be built', () => {
  it('the older link keeps working (nothing is deleted or written first)', async () => {
    const pg = await makeDb();
    await owner(pg);
    const first = (await createResetMail(pg, 'owner@example.com'))!;
    try {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('APP_URL', '');
      await expect(createResetMail(pg, 'owner@example.com')).rejects.toThrow('APP_URL');
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await getResetEmail(pg, tokenFrom(first))).toBe('owner@example.com');
    expect((await pg.query(`SELECT 1 FROM email_codes WHERE purpose = 'reset_password'`)).rows).toHaveLength(1);
  });
});

describe('getResetEmail', () => {
  it('unknown, expired and made-up links give nothing', async () => {
    const pg = await makeDb();
    await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    expect(await getResetEmail(pg, token)).toBe('owner@example.com');
    expect(await getResetEmail(pg, 'nope')).toBeNull();
    expect(await getResetEmail(pg, hashToken(token))).toBeNull(); // the stored hash is not a working link
    await pg.query(`UPDATE email_codes SET expires_at = now() - interval '1 second'`);
    expect(await getResetEmail(pg, token)).toBeNull();
  });

  it('a "verify_email" code is never a reset link', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify_email', $2, now() + interval '1 hour')`, [id, hashToken('abc')]);
    expect(await getResetEmail(pg, 'abc')).toBeNull();
    expect(await resetPassword(pg, 'abc', 'new-password-1')).toEqual({ ok: false });
  });
});

describe('resetPassword', () => {
  it('changes the password, and the link works only once', async () => {
    const pg = await makeDb();
    await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    expect(await resetPassword(pg, token, 'new-password-1')).toEqual({ ok: true });
    expect(await login(pg, 'owner@example.com', 'new-password-1', '9.9.9.9')).toMatchObject({ ok: true });
    expect(await login(pg, 'owner@example.com', 'old-password-1', '9.9.9.9')).toMatchObject({ ok: false });
    expect(await resetPassword(pg, token, 'third-password-1')).toEqual({ ok: false });
    expect(await login(pg, 'owner@example.com', 'new-password-1', '9.9.9.9')).toMatchObject({ ok: true }); // unchanged
    expect(await rows(pg)).toHaveLength(0);
  });

  it('two people sending the same link at the same moment: only one wins', async () => {
    const pg = await makeDb();
    await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    const results = await Promise.all([resetPassword(pg, token, 'first-password-1'), resetPassword(pg, token, 'second-password-1')]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('an expired link changes nothing', async () => {
    const pg = await makeDb();
    await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    await pg.query(`UPDATE email_codes SET expires_at = now() - interval '1 minute'`);
    expect(await resetPassword(pg, token, 'new-password-1')).toEqual({ ok: false });
    expect(await login(pg, 'owner@example.com', 'old-password-1', '9.9.9.9')).toMatchObject({ ok: true });
    expect((await pg.query(`SELECT password_changed_at FROM users WHERE email = 'owner@example.com'`)).rows[0]).toEqual({ password_changed_at: null });
  });

  it('a link that somehow belongs to the super admin never changes his password', async () => {
    const pg = await makeDb();
    const boss = await add.superAdmin(pg, 'boss@example.com');
    const before = (await pg.query(`SELECT password_hash FROM users WHERE id = $1`, [boss])).rows[0];
    await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'reset_password', $2, now() + interval '1 hour')`, [boss, hashToken('bosstoken')]);
    expect(await resetPassword(pg, 'bosstoken', 'new-password-1')).toEqual({ ok: false });
    expect((await pg.query(`SELECT password_hash FROM users WHERE id = $1`, [boss])).rows[0]).toEqual(before);
    expect(await getResetEmail(pg, 'bosstoken')).toBeNull();
  });

  it('using one link cancels every other link of the same person', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'reset_password', $2, now() + interval '1 hour')`, [id, hashToken('other-link')]);
    expect(await getResetEmail(pg, 'other-link')).toBe('owner@example.com');
    expect(await resetPassword(pg, token, 'new-password-1')).toEqual({ ok: true });
    expect(await getResetEmail(pg, 'other-link')).toBeNull();
    expect(await rows(pg)).toHaveLength(0);
  });

  it('does not touch another owner', async () => {
    const pg = await makeDb();
    await owner(pg, 'a@example.com', 'a-old-password');
    await owner(pg, 'b@example.com', 'b-old-password');
    const token = tokenFrom((await createResetMail(pg, 'a@example.com'))!);
    await resetPassword(pg, token, 'a-new-password');
    expect(await login(pg, 'b@example.com', 'b-old-password', '9.9.9.9')).toMatchObject({ ok: true });
    const hash = ((await pg.query(`SELECT password_hash FROM users WHERE email = 'b@example.com'`)).rows[0] as { password_hash: string }).password_hash;
    expect(await verifyPassword('b-old-password', hash)).toBe(true);
  });

  it('forgets the failed-login counter so he can log in at once', async () => {
    const pg = await makeDb();
    await owner(pg);
    for (let i = 0; i < 5; i++) await login(pg, 'owner@example.com', 'wrong', `7.7.7.${i}`);
    expect(await login(pg, 'owner@example.com', 'old-password-1', '7.7.7.9')).toMatchObject({ ok: false, reason: 'rate_limited' });
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    await resetPassword(pg, token, 'new-password-1');
    expect(await login(pg, 'owner@example.com', 'new-password-1', '7.7.7.9')).toMatchObject({ ok: true });
  });
});

describe('a reset logs out everyone who was logged in', () => {
  it('a cookie made before the reset stops working, a new one works', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    const oldCookie = (await readSession(await createSessionToken(id)))!;
    expect(await findSessionUser(pg, id, oldCookie.issuedAt)).toMatchObject({ id, role: 'owner' });
    await pg.query(`UPDATE users SET password_changed_at = now() + interval '5 seconds' WHERE id = $1`, [id]);
    expect(await findSessionUser(pg, id, oldCookie.issuedAt)).toBeNull();
    expect(await findSessionUser(pg, id, oldCookie.issuedAt + 10)).toMatchObject({ id });
  });

  it('a cookie made in the same second as the reset still works (cookies know whole seconds only)', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    const now = Math.floor(((await pg.query(`SELECT extract(epoch FROM now()) AS e`)).rows[0] as { e: number }).e);
    await pg.query(`UPDATE users SET password_changed_at = to_timestamp($2 + 0.9) WHERE id = $1`, [id, now]);
    expect(await findSessionUser(pg, id, now)).toMatchObject({ id });
    expect(await findSessionUser(pg, id, now - 1)).toBeNull();
  });

  it('through the real flow: a login from before the reset is dead, unknown and unverified users are refused', async () => {
    const pg = await makeDb();
    const id = await owner(pg);
    const now = (await readSession(await createSessionToken(id)))!.issuedAt;
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    await resetPassword(pg, token, 'new-password-1');
    expect(await findSessionUser(pg, id, now - 10)).toBeNull(); // logged in 10 seconds before the reset
    expect(await findSessionUser(pg, id, now + 10)).toMatchObject({ id }); // logged in with the new password
    expect(await findSessionUser(pg, '00000000-0000-4000-8000-000000000000', now)).toBeNull();
    await pg.query(`UPDATE users SET email_verified_at = NULL, password_changed_at = NULL WHERE id = $1`, [id]);
    expect(await findSessionUser(pg, id, now)).toBeNull();
  });
});

describe('handleForgot', () => {
  const OK = { status: 200, body: { ok: true } };

  it('answers exactly the same for a registered owner, a stranger and the super admin; mails only the owner', async () => {
    const pg = await makeDb();
    await owner(pg);
    await add.superAdmin(pg, 'boss@example.com');
    await pg.query(`UPDATE users SET email_verified_at = now() WHERE email = 'boss@example.com'`);
    const mails: Mail[] = [];
    const send = (m: Mail) => { mails.push(m); };
    const a = await handleForgot(post({ email: 'owner@example.com' }), pg, send);
    const b = await handleForgot(post({ email: 'nobody@example.com' }, '2.2.2.2'), pg, send);
    const c = await handleForgot(post({ email: 'boss@example.com' }, '3.3.3.3'), pg, send);
    expect([a, b, c]).toEqual([OK, OK, OK]);
    expect(mails.map((m) => m.to)).toEqual(['owner@example.com']);
    expect(JSON.stringify(a)).not.toContain(tokenFrom(mails[0])); // the token is never in the answer
  });

  it('a failing mail service does not change the answer (and is not shown)', async () => {
    const pg = await makeDb();
    await owner(pg);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handleForgot(post({ email: 'owner@example.com' }), pg, () => { throw new Error('smtp down'); });
    expect(res).toEqual(OK);
    spy.mockRestore();
  });

  it('a failure while CREATING the mail (APP_URL missing in production) is hidden too: same answer as for a stranger', async () => {
    const pg = await makeDb();
    await owner(pg);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mails: Mail[] = [];
    const send = (m: Mail) => { mails.push(m); };
    let registered, stranger;
    try {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('APP_URL', '');
      registered = await handleForgot(post({ email: 'owner@example.com' }), pg, send);
      stranger = await handleForgot(post({ email: 'nobody@example.com' }, '2.2.2.2'), pg, send);
    } finally {
      vi.unstubAllEnvs(); // always, even if a request rejects: other tests need APP_URL
      spy.mockRestore();
    }
    expect(registered).toEqual(OK);
    expect(stranger).toEqual(OK);
    expect(mails).toEqual([]);
  });

  it('the answer goes out BEFORE any work that differs: nothing is looked up, written or sent until the deferred task runs', async () => {
    const pg = await makeDb();
    await owner(pg);
    const mails: Mail[] = [];
    const tasks: Array<() => Promise<void>> = [];
    const count = async () => Number(((await pg.query(`SELECT count(*)::int AS n FROM email_codes WHERE purpose = 'reset_password'`)).rows[0] as { n: number }).n);
    const res = await handleForgot(post({ email: 'owner@example.com' }), pg, (m) => { mails.push(m); }, (t) => { tasks.push(t); });
    expect(res).toEqual(OK);
    expect(await count()).toBe(0); // the link is not even written yet
    expect(mails).toEqual([]);
    await tasks[0]();
    expect(await count()).toBe(1);
    expect(mails).toHaveLength(1);
  });

  it('a body that LOOKS like our own answer is still checked like any other body', async () => {
    const pg = await makeDb();
    await owner(pg);
    const mails: Mail[] = [];
    const res = await handleForgot(post({ status: 200, body: { ok: true } }), pg, (m) => { mails.push(m); });
    expect(res).toEqual({ status: 400, body: { error: 'طلب غير صالح' } }); // not the fake success it asked for
    const reset = await handleReset(post({ status: 200, body: { redirect: '/x' } }), pg);
    expect(reset.status).toBe(400);
  });

  it('is limited to 5 requests per email and per address, whatever the email', async () => {
    const pg = await makeDb();
    await owner(pg);
    const send = vi.fn();
    for (let i = 0; i < 5; i++) expect((await handleForgot(post({ email: 'owner@example.com' }, `5.5.5.${i}`), pg, send)).status).toBe(200);
    expect((await handleForgot(post({ email: 'owner@example.com' }, '5.5.5.99'), pg, send)).status).toBe(429); // same email, new address
    expect(send).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 5; i++) await handleForgot(post({ email: `nobody${i}@example.com` }, '6.6.6.6'), pg, send);
    expect((await handleForgot(post({ email: 'owner@example.com' }, '6.6.6.6'), pg, send)).status).toBe(429); // same address, other emails
    expect(send).toHaveBeenCalledTimes(5);
  });

  it('refuses requests that are not JSON (415) or have a bad body (400)', async () => {
    const pg = await makeDb();
    const send = vi.fn();
    expect((await handleForgot(post('email=a@b.com', '1.1.1.1', { 'content-type': 'application/x-www-form-urlencoded' }), pg, send)).status).toBe(415);
    expect((await handleForgot(post('{bad', '1.1.1.1'), pg, send)).status).toBe(400);
    expect((await handleForgot(post({ email: 5 }), pg, send)).status).toBe(400);
    expect((await handleForgot(post({ email: 'a'.repeat(300) }), pg, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('handleReset', () => {
  async function ready() {
    const pg = await makeDb();
    const id = await owner(pg);
    const token = tokenFrom((await createResetMail(pg, 'owner@example.com'))!);
    return { pg, id, token };
  }

  it('sets the password and sends him to the login page (no automatic login)', async () => {
    const { pg, token } = await ready();
    const res = await handleReset(post({ token, password: 'brand-new-password' }), pg);
    expect(res).toEqual({ status: 200, body: { redirect: '/login?reset=1' } });
    expect(await login(pg, 'owner@example.com', 'brand-new-password', '9.9.9.9')).toMatchObject({ ok: true });
  });

  it('a too short or too long password is refused WITHOUT using up the link', async () => {
    const { pg, token } = await ready();
    expect((await handleReset(post({ token, password: 'short' }), pg)).status).toBe(400);
    expect((await handleReset(post({ token, password: 'x'.repeat(201) }), pg)).status).toBe(400);
    expect(await getResetEmail(pg, token)).toBe('owner@example.com');
    expect((await handleReset(post({ token, password: 'long-enough-password' }), pg)).status).toBe(200);
  });

  it('a wrong, used or expired link gives the same message and changes nothing', async () => {
    const { pg, token } = await ready();
    const wrong = await handleReset(post({ token: 'wrong', password: 'brand-new-password' }), pg);
    expect(wrong.status).toBe(400);
    await handleReset(post({ token, password: 'brand-new-password' }), pg);
    const used = await handleReset(post({ token, password: 'another-password' }, '8.8.8.8'), pg);
    expect(used).toEqual(wrong);
    expect(await login(pg, 'owner@example.com', 'brand-new-password', '9.9.9.9')).toMatchObject({ ok: true });
  });

  it('guessing links is limited: after 5 wrong tries even the right link is refused for a while', async () => {
    const { pg, token } = await ready();
    for (let i = 0; i < 5; i++) expect((await handleReset(post({ token: `guess${i}`, password: 'brand-new-password' }), pg)).status).toBe(400);
    expect((await handleReset(post({ token, password: 'brand-new-password' }), pg)).status).toBe(429);
    expect((await handleReset(post({ token, password: 'brand-new-password' }, '4.4.4.4'), pg)).status).toBe(200); // another address is not blocked
  });

  it('refuses requests that are not JSON (415) or have a bad body (400)', async () => {
    const { pg, token } = await ready();
    expect((await handleReset(post(`token=${token}`, '1.1.1.1', { 'content-type': 'text/plain' }), pg)).status).toBe(415);
    expect((await handleReset(post({ token }), pg)).status).toBe(400);
    expect((await handleReset(post({ token: '', password: 'brand-new-password' }), pg)).status).toBe(400);
    expect(await getResetEmail(pg, token)).toBe('owner@example.com');
  });
});
