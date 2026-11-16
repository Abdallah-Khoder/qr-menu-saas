import { describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { add, makeDb } from './helpers';
import { createInvite, hashToken, INVITE_MINUTES } from '../src/lib/invites';
import type { Mail } from '../src/lib/email';
import { getInviteEmail, signUpOwner } from '../src/lib/signup';
import { handleSignup } from '../src/lib/signup-request';
import { readSessionToken } from '../src/lib/session';
import { verifyPassword } from '../src/lib/password.mjs';
import { checkOwnerPassword } from '../src/lib/credentials.mjs';

process.env.SESSION_SECRET = 'a'.repeat(40);

const tokenFrom = (m: Mail) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

/** A database with an admin and one real invite (made the real way, so the token is genuine). */
async function setup(email = 'new@example.com') {
  const pg = await makeDb();
  const admin = await add.superAdmin(pg);
  let token = '';
  await createInvite(pg, admin, email, async (m) => { token = tokenFrom(m); });
  return { pg, admin, token };
}

const count = async (pg: PGlite, table: string) =>
  ((await pg.query(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0] as { n: number }).n;

const post = (body: unknown, ip = '1.1.1.1', headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request('http://x/api/signup', {
    method: 'POST',
    headers: { ...headers, 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('owner password rule', () => {
  it('needs 8 characters', () => {
    expect(checkOwnerPassword('1234567')).toBe('short');
    expect(checkOwnerPassword('12345678')).toBeNull();
    expect(checkOwnerPassword('x'.repeat(201))).toBe('long');
  });
});

describe('looking at an invite', () => {
  it('shows the invited email for a valid token only', async () => {
    const { pg, token } = await setup();
    expect(await getInviteEmail(pg, token)).toBe('new@example.com');
    expect(await getInviteEmail(pg, 'not-a-token')).toBeNull();
  });
  it('shows nothing for a used or an expired invite', async () => {
    const { pg, token } = await setup();
    await pg.query(`UPDATE invites SET expires_at = now() - interval '1 second'`);
    expect(await getInviteEmail(pg, token)).toBeNull();
    const second = await setup();
    await signUpOwner(second.pg, { token: second.token, name: 'A', password: 'password-1' });
    expect(await getInviteEmail(second.pg, second.token)).toBeNull();
  });
});

describe('signUpOwner', () => {
  it('creates a verified owner, his restaurant, and uses up the invite', async () => {
    const { pg, token } = await setup();
    const out = await signUpOwner(pg, { token, name: '  مطعم الشعار ', password: 'password-1' });
    expect(out.ok).toBe(true);
    const user = (await pg.query(`SELECT id, email, role, password_hash, email_verified_at FROM users WHERE email = 'new@example.com'`)).rows[0] as Record<string, string>;
    expect(user.role).toBe('owner');
    expect(user.email_verified_at).not.toBeNull();
    expect(user.password_hash).not.toContain('password-1');
    expect(await verifyPassword('password-1', user.password_hash)).toBe(true);
    const rest = (await pg.query(`SELECT owner_id, name, public_slug, status FROM restaurants`)).rows[0] as Record<string, string>;
    expect(rest.owner_id).toBe(user.id);
    expect(rest.name).toBe('مطعم الشعار'); // shown exactly as typed (trimmed)
    expect(rest.public_slug).toMatch(/^mtam-alshaar-[a-z0-9]{10}$/); // Arabic written in Latin letters
    expect(rest.status).toBe('active');
    const inv = (await pg.query(`SELECT used_at, used_by FROM invites`)).rows[0] as Record<string, string>;
    expect(inv.used_at).not.toBeNull();
    expect(inv.used_by).toBe(user.id);
  });

  it('a used link cannot be used again', async () => {
    const { pg, token } = await setup();
    await signUpOwner(pg, { token, name: 'A', password: 'password-1' });
    expect(await signUpOwner(pg, { token, name: 'B', password: 'password-2' })).toEqual({ ok: false, reason: 'invalid_link' });
    expect(await count(pg, 'users')).toBe(2); // admin + first owner
    expect(await count(pg, 'restaurants')).toBe(1);
  });

  it('an expired link fails and creates nothing', async () => {
    const { pg, token } = await setup();
    await pg.query(`UPDATE invites SET expires_at = now() - interval '1 second'`);
    expect(await signUpOwner(pg, { token, name: 'A', password: 'password-1' })).toEqual({ ok: false, reason: 'invalid_link' });
    expect(await count(pg, 'users')).toBe(1);
    expect(await count(pg, 'restaurants')).toBe(0);
  });

  it('a link replaced by a newer invite stops working', async () => {
    const { pg, admin, token } = await setup();
    await createInvite(pg, admin, 'new@example.com', async () => {});
    expect((await signUpOwner(pg, { token, name: 'A', password: 'password-1' })).ok).toBe(false);
  });

  it('an unknown token fails', async () => {
    const { pg } = await setup();
    expect((await signUpOwner(pg, { token: 'x'.repeat(43), name: 'A', password: 'password-1' })).ok).toBe(false);
    expect(await count(pg, 'restaurants')).toBe(0);
  });

  it('the stored hash, not the token, is what is looked up', async () => {
    const { pg, token } = await setup();
    // someone who only knows the database content (the hash) cannot use it as a token
    expect((await signUpOwner(pg, { token: hashToken(token), name: 'A', password: 'password-1' })).ok).toBe(false);
  });

  it('email already registered: refused and the invite is NOT used up', async () => {
    const { pg, token } = await setup();
    await add.owner(pg, 'new@example.com'); // registered some other way after the invite was sent
    expect(await signUpOwner(pg, { token, name: 'A', password: 'password-1' })).toEqual({ ok: false, reason: 'invalid_link' });
    expect(await count(pg, 'restaurants')).toBe(0);
    expect(((await pg.query(`SELECT used_at FROM invites`)).rows[0] as { used_at: unknown }).used_at).toBeNull();
  });

  it('two sends of the same link at the same moment: exactly one account', async () => {
    const { pg, token } = await setup();
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => signUpOwner(pg, { token, name: `R${i}`, password: 'password-1' })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await count(pg, 'restaurants')).toBe(1);
    expect(await count(pg, 'users')).toBe(2);
  });

  it('an unlucky equal public link: tries another one, nothing is lost', async () => {
    const { pg, token } = await setup();
    const other = await add.owner(pg, 'other@example.com');
    await add.restaurant(pg, other, 'taken-aaaaaaaaaa');
    const slugs = ['taken-aaaaaaaaaa', 'free-bbbbbbbbbb'];
    const out = await signUpOwner(pg, { token, name: 'A', password: 'password-1' }, () => slugs.shift()!);
    expect(out.ok).toBe(true);
    expect(((await pg.query(`SELECT public_slug FROM restaurants WHERE name = 'A'`)).rows[0] as { public_slug: string }).public_slug).toBe('free-bbbbbbbbbb');
  });

  it('gives up with an error (and keeps the invite) if links keep colliding', async () => {
    const { pg, token } = await setup();
    const other = await add.owner(pg, 'other@example.com');
    await add.restaurant(pg, other, 'taken-aaaaaaaaaa');
    await expect(signUpOwner(pg, { token, name: 'A', password: 'password-1' }, () => 'taken-aaaaaaaaaa')).rejects.toThrow();
    expect(((await pg.query(`SELECT used_at FROM invites`)).rows[0] as { used_at: unknown }).used_at).toBeNull();
  });
});

describe('handleSignup', () => {
  const good = (token: string) => ({ token, name: 'Shaar Crepe', password: 'password-1' });

  it('works: 200, goes to the dashboard, logs the new owner in', async () => {
    const { pg, token } = await setup();
    const out = await handleSignup(post(good(token)), pg);
    expect(out.status).toBe(200);
    expect(out.body.redirect).toBe('/dashboard');
    const id = (await pg.query(`SELECT id FROM users WHERE email = 'new@example.com'`)).rows[0] as { id: string };
    expect(await readSessionToken(out.token)).toBe(id.id);
  });

  it('refuses anything that is not JSON (415) and creates nothing', async () => {
    const { pg, token } = await setup();
    const out = await handleSignup(post(good(token), '1.1.1.1', { 'content-type': 'application/x-www-form-urlencoded' }), pg);
    expect(out.status).toBe(415);
    expect(await count(pg, 'restaurants')).toBe(0);
  });

  it('bad body: 400', async () => {
    const { pg } = await setup();
    expect((await handleSignup(post('not json'), pg)).status).toBe(400);
    expect((await handleSignup(post({ token: 1 }), pg)).status).toBe(400);
  });

  it('form mistakes: 400, the invite stays usable, and they do not use up attempts', async () => {
    const { pg, token } = await setup();
    for (let i = 0; i < 10; i++) {
      expect((await handleSignup(post({ ...good(token), password: 'short' }), pg)).status).toBe(400);
      expect((await handleSignup(post({ ...good(token), name: '   ' }), pg)).status).toBe(400);
    }
    expect((await handleSignup(post({ ...good(token), name: 'x'.repeat(81) }), pg)).status).toBe(400);
    for (const name of ['🍕🍔', '!!! ---', '...']) {
      const out = await handleSignup(post({ ...good(token), name }), pg);
      expect(out.status).toBe(400);
      expect(out.body.error).toContain('حرف أو رقم');
    }
    expect(await count(pg, 'login_attempts')).toBe(0);
    expect((await handleSignup(post(good(token)), pg)).status).toBe(200);
  });

  it('a wrong link gives one generic message, whatever the reason', async () => {
    const { pg, token } = await setup();
    const unknown = await handleSignup(post(good('y'.repeat(43))), pg);
    await handleSignup(post(good(token), '2.2.2.2'), pg);
    const used = await handleSignup(post(good(token), '3.3.3.3'), pg);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toBe('الرابط غير صالح');
    expect(used.body).toEqual(unknown.body);
  });

  it('someone guessing links is stopped after 5 tries, even with a good link afterwards', async () => {
    const { pg, token } = await setup();
    for (let i = 0; i < 5; i++) expect((await handleSignup(post(good(`g${i}`)), pg)).status).toBe(400);
    expect((await handleSignup(post(good('g6')), pg)).status).toBe(429);
    expect((await handleSignup(post(good(token)), pg)).status).toBe(429);
    expect(await count(pg, 'restaurants')).toBe(0);
    // another person from another place is not affected
    expect((await handleSignup(post(good(token), '9.9.9.9'), pg)).status).toBe(200);
  });

  it('a successful sign-up does not leave a counted attempt behind', async () => {
    const { pg, token } = await setup();
    await handleSignup(post(good(token)), pg);
    expect(await count(pg, 'login_attempts')).toBe(0);
  });

  it('invite time is the 20 minutes the email promises', () => {
    expect(INVITE_MINUTES).toBe(20);
  });
});
