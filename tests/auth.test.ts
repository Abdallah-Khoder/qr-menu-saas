import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { add, makeDb } from './helpers';
import { hashPassword, verifyPassword } from '../src/lib/password.mjs';
import { createSessionToken, readSessionToken } from '../src/lib/session';
import { login } from '../src/lib/login';
import { handleLogin } from '../src/lib/login-request';
import { getAdminStats } from '../src/lib/admin-stats';
import { SignJWT } from 'jose';
import { vi } from 'vitest';
import { checkNewCredentials, EMAIL_MAX, PASSWORD_MAX } from '../src/lib/credentials.mjs';

process.env.SESSION_SECRET = 'a'.repeat(40);

async function userWithPassword(pg: PGlite, email: string, password: string, role = 'owner', verified = true) {
  const hash = await hashPassword(password);
  const res = await pg.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, email_verified_at)
     VALUES ($1, $2, $3, ${verified ? 'now()' : 'NULL'}) RETURNING id`,
    [email, hash, role],
  );
  return res.rows[0].id;
}

const req = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request('http://x/api/login', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const h = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
  it('never stores the password and uses a new salt each time', async () => {
    const [a, b] = await Promise.all([hashPassword('same-password-1'), hashPassword('same-password-1')]);
    expect(a).not.toContain('same-password-1');
    expect(a).not.toBe(b);
  });
  it('returns false (does not throw) for garbage stored values', async () => {
    expect(await verifyPassword('x', 'hash')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });
});

describe('session token', () => {
  it('round-trips the user id', async () => {
    expect(await readSessionToken(await createSessionToken('user-1'))).toBe('user-1');
  });
  it('rejects missing, garbage, and tokens signed with another secret', async () => {
    expect(await readSessionToken(undefined)).toBeNull();
    expect(await readSessionToken('abc.def.ghi')).toBeNull();
    const forged = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1')
      .setExpirationTime('7d').sign(new TextEncoder().encode('b'.repeat(40)));
    expect(await readSessionToken(forged)).toBeNull();
  });
  it('rejects an expired token', async () => {
    const old = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject('user-1')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 10).sign(new TextEncoder().encode('a'.repeat(40)));
    expect(await readSessionToken(old)).toBeNull();
  });
  it('refuses to work without a long enough secret', async () => {
    const saved = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = 'short';
    await expect(createSessionToken('u')).rejects.toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
  });
});

describe('login', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await makeDb();
    await userWithPassword(pg, 'boss@example.com', 'a-long-password', 'super_admin');
    await userWithPassword(pg, 'unverified@example.com', 'a-long-password', 'owner', false);
  });

  it('logs in with the right password, ignoring case and spaces in the email', async () => {
    const r = await login(pg, '  Boss@Example.com ', 'a-long-password', '1.1.1.1');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.role).toBe('super_admin');
  });
  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrong = await login(pg, 'boss@example.com', 'nope', '2.2.2.2');
    const unknown = await login(pg, 'nobody@example.com', 'nope', '2.2.2.3');
    expect(wrong).toEqual({ ok: false, reason: 'invalid' });
    expect(unknown).toEqual(wrong);
  });
  it('refuses an account whose email is not verified, even with the right password', async () => {
    expect(await login(pg, 'unverified@example.com', 'a-long-password', '3.3.3.3')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('blocks after 5 failures, even with the right password, then recovers after the window', async () => {
    for (let i = 0; i < 5; i++) await login(pg, 'boss@example.com', 'bad', '9.9.9.9');
    expect(await login(pg, 'boss@example.com', 'a-long-password', '8.8.8.8')).toEqual({ ok: false, reason: 'rate_limited' });
    await pg.query(`UPDATE login_attempts SET created_at = now() - interval '16 minutes'`);
    expect((await login(pg, 'boss@example.com', 'a-long-password', '8.8.8.8')).ok).toBe(true);
  });
  it('blocks one IP guessing many different emails', async () => {
    for (let i = 0; i < 5; i++) await login(pg, `guess${i}@example.com`, 'bad', '7.7.7.7');
    expect(await login(pg, 'boss@example.com', 'a-long-password', '7.7.7.7')).toEqual({ ok: false, reason: 'rate_limited' });
  });
  it('a successful login clears the email failures', async () => {
    await pg.query('DELETE FROM login_attempts');
    for (let i = 0; i < 3; i++) await login(pg, 'boss@example.com', 'bad', '6.6.6.1');
    await login(pg, 'boss@example.com', 'a-long-password', '6.6.6.2');
    const left = await pg.query(`SELECT COUNT(*)::int AS n FROM login_attempts WHERE key = 'email:boss@example.com'`);
    expect((left.rows[0] as { n: number }).n).toBe(0);
  });
  it('20 guesses sent at the same moment: EXACTLY 5 are checked, the rest are refused (10 rounds, it used to be flaky)', async () => {
    for (let round = 0; round < 10; round++) {
      await pg.query('DELETE FROM login_attempts');
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) => login(pg, 'boss@example.com', `guess-${i}`, '10.0.0.1')),
      );
      expect(results.filter((r) => !r.ok && r.reason === 'invalid')).toHaveLength(5);
      expect(results.filter((r) => !r.ok && r.reason === 'rate_limited')).toHaveLength(15);
      // refused requests leave nothing behind, so they cannot extend the block
      const rows = await pg.query(`SELECT COUNT(*)::int AS n FROM login_attempts WHERE key = 'email:boss@example.com'`);
      expect((rows.rows[0] as { n: number }).n).toBe(5);
    }
  });
  it('a successful login does not leave a counted attempt for the IP', async () => {
    await pg.query('DELETE FROM login_attempts');
    for (let i = 0; i < 6; i++) expect((await login(pg, 'boss@example.com', 'a-long-password', '10.0.0.2')).ok).toBe(true);
  });
  it('deletes failure rows older than one day', async () => {
    await pg.query(`INSERT INTO login_attempts (key, created_at) VALUES ('ip:old', now() - interval '2 days')`);
    vi.spyOn(Math, 'random').mockReturnValue(0); // force the occasional cleanup to run now
    await login(pg, 'nobody@example.com', 'bad', '5.5.5.5');
    vi.restoreAllMocks();
    const old = await pg.query(`SELECT COUNT(*)::int AS n FROM login_attempts WHERE key = 'ip:old'`);
    expect((old.rows[0] as { n: number }).n).toBe(0);
  });
});

describe('login request', () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = await makeDb();
    await userWithPassword(pg, 'boss@example.com', 'a-long-password', 'super_admin');
    await userWithPassword(pg, 'owner@example.com', 'a-long-password', 'owner');
  });
  it('sends the super-admin to /admin and an owner to /dashboard, with a session token', async () => {
    const a = await handleLogin(req({ email: 'boss@example.com', password: 'a-long-password' }), pg);
    const o = await handleLogin(req({ email: 'owner@example.com', password: 'a-long-password' }), pg);
    expect(a.status).toBe(200); expect(a.body.redirect).toBe('/admin'); expect(a.token).toBeTruthy();
    expect(o.body.redirect).toBe('/dashboard');
  });
  it('401 with one generic message and NO token on a wrong password', async () => {
    const r = await handleLogin(req({ email: 'boss@example.com', password: 'wrong' }, { 'content-type': 'application/json', 'x-forwarded-for': '4.4.4.4' }), pg);
    expect(r.status).toBe(401); expect(r.token).toBeUndefined();
  });
  it('429 when rate limited', async () => {
    const h = { 'content-type': 'application/json', 'x-forwarded-for': '4.4.4.5' };
    for (let i = 0; i < 5; i++) await handleLogin(req({ email: 'a@b.co', password: 'x' }, h), pg);
    expect((await handleLogin(req({ email: 'a@b.co', password: 'x' }, h), pg)).status).toBe(429);
  });
  it('rejects non-JSON content type (CSRF defence) with 415', async () => {
    const r = await handleLogin(req('email=a&password=b', { 'content-type': 'application/x-www-form-urlencoded' }), pg);
    expect(r.status).toBe(415);
  });
  it('rejects text/plain; note=application/json (415)', async () => {
    const r = await handleLogin(req('{"email":"a@b.co","password":"x"}', { 'content-type': 'text/plain; note=application/json' }), pg);
    expect(r.status).toBe(415);
  });
  it('400 for broken or incomplete bodies', async () => {
    expect((await handleLogin(req('{not json'), pg)).status).toBe(400);
    expect((await handleLogin(req({ email: 'a@b.co' }), pg)).status).toBe(400);
    expect((await handleLogin(req({ email: 'a@b.co', password: 5 }), pg)).status).toBe(400);
  });
});

describe('admin stats', () => {
  it('counts zero on an empty database', async () => {
    expect(await getAdminStats(await makeDb())).toEqual({ restaurants: 0, active: 0, suspended: 0, openInvites: 0 });
  });
  it('counts restaurants by status and only open invites', async () => {
    const pg = await makeDb();
    const admin = await add.superAdmin(pg);
    const a = await add.owner(pg, 'a@example.com'); const b = await add.owner(pg, 'b@example.com');
    await add.restaurant(pg, a, 'aaa-k3x9qp7vtz');
    await add.restaurant(pg, b, 'bbb-k3x9qp7vtz', { status: 'suspended' });
    await pg.query(`INSERT INTO invites (token_hash, created_by, expires_at) VALUES ('h1', $1, now() + interval '1 day')`, [admin]);
    await pg.query(`INSERT INTO invites (token_hash, created_by, expires_at) VALUES ('h2', $1, now() - interval '1 day')`, [admin]);
    await pg.query(`INSERT INTO invites (token_hash, created_by, expires_at, used_at) VALUES ('h3', $1, now() + interval '1 day', now())`, [admin]);
    expect(await getAdminStats(pg)).toEqual({ restaurants: 2, active: 1, suspended: 1, openInvites: 1 });
  });
});

describe('credentials accepted by create-admin match what login accepts', () => {
  const email = 'boss@example.com';
  it('accepts a normal pair and the exact limits', () => {
    expect(checkNewCredentials(email, 'a'.repeat(12))).toBeNull();
    expect(checkNewCredentials(email, 'a'.repeat(PASSWORD_MAX))).toBeNull();
    expect(checkNewCredentials('a'.repeat(EMAIL_MAX - 12) + '@example.com', 'a'.repeat(12))).toBeNull();
  });
  it('refuses too short, too long, and bad emails', () => {
    expect(checkNewCredentials(email, 'a'.repeat(11))).toMatch(/short/);
    expect(checkNewCredentials(email, 'a'.repeat(PASSWORD_MAX + 1))).toMatch(/long/);
    expect(checkNewCredentials('a'.repeat(EMAIL_MAX) + '@example.com', 'a'.repeat(12))).toMatch(/long/);
    expect(checkNewCredentials('not-an-email', 'a'.repeat(12))).toMatch(/email/);
    // the login form (type=email) cannot submit these, so the script must not create them
    expect(checkNewCredentials('مستخدم@example.com', 'a'.repeat(12))).toMatch(/email/);
    expect(checkNewCredentials('a b@example.com', 'a'.repeat(12))).toMatch(/email/);
    expect(checkNewCredentials('a@example', 'a'.repeat(12))).toMatch(/email/);
    expect(checkNewCredentials('first.last+tag@sub.example.co', 'a'.repeat(12))).toBeNull();
  });
  it('an account made with the longest allowed password can really log in', async () => {
    const pg = await makeDb();
    const longest = 'p'.repeat(PASSWORD_MAX);
    await userWithPassword(pg, email, longest, 'super_admin');
    const r = await handleLogin(req({ email, password: longest }), pg);
    expect(r.status).toBe(200);
  });
});
