import { describe, expect, it } from 'vitest';
import { add, makeDb } from './helpers';
import { createInvite, hashToken, inviteLink, listInvites, revokeInvite, INVITE_MINUTES } from '../src/lib/invites';
import type { Mail } from '../src/lib/email';

/** A fake mail sender: remembers what would have been sent, sends nothing. */
function fakeSender(fail = false) {
  const sent: Mail[] = [];
  return {
    sent,
    send: async (m: Mail) => {
      if (fail) throw new Error('smtp down');
      sent.push(m);
    },
  };
}
const tokenFrom = (m: Mail) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get('token')!;

async function setup() {
  const pg = await makeDb();
  const admin = await add.superAdmin(pg);
  return { pg, admin };
}

describe('create invite', () => {
  it('emails a link that contains a token, valid for 20 minutes', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    expect(await createInvite(pg, admin, 'Owner@Example.com ', mail.send)).toEqual({ ok: true });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe('owner@example.com');
    expect(mail.sent[0].text).toContain('20 دقيقة');
    const row = (await pg.query(`SELECT email, EXTRACT(EPOCH FROM (expires_at - created_at))::int AS seconds FROM invites`)).rows[0] as { email: string; seconds: number };
    expect(row.email).toBe('owner@example.com');
    expect(INVITE_MINUTES).toBe(20);
    expect(row.seconds).toBe(20 * 60);
  });
  it('stores only the HASH of the token, never the token', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    await createInvite(pg, admin, 'o@example.com', mail.send);
    const token = tokenFrom(mail.sent[0]);
    expect(token.length).toBeGreaterThanOrEqual(40);
    const stored = (await pg.query(`SELECT token_hash FROM invites`)).rows[0] as { token_hash: string };
    expect(stored.token_hash).toBe(hashToken(token));
    expect(stored.token_hash).not.toContain(token);
  });
  it('every invite gets a different token', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    await createInvite(pg, admin, 'a@example.com', mail.send);
    await createInvite(pg, admin, 'b@example.com', mail.send);
    expect(tokenFrom(mail.sent[0])).not.toBe(tokenFrom(mail.sent[1]));
  });
  it('rejects bad emails and sends nothing', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    for (const bad of ['', 'nope', 'a b@example.com', 'مستخدم@example.com']) {
      expect(await createInvite(pg, admin, bad, mail.send)).toEqual({ ok: false, reason: 'invalid_email' });
    }
    expect(mail.sent).toHaveLength(0);
    expect(await pg.query(`SELECT 1 FROM invites`)).toHaveProperty('rows.length', 0);
  });
  it('refuses an email that already has an account', async () => {
    const { pg, admin } = await setup();
    await add.owner(pg, 'taken@example.com');
    const mail = fakeSender();
    expect(await createInvite(pg, admin, 'TAKEN@example.com', mail.send)).toEqual({ ok: false, reason: 'already_registered' });
    expect(mail.sent).toHaveLength(0);
  });
  it('a new invite for the same email cancels the older open one', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    await createInvite(pg, admin, 'o@example.com', mail.send);
    await createInvite(pg, admin, 'o@example.com', mail.send);
    const statuses = (await listInvites(pg)).map((i) => i.status).sort();
    expect(statuses).toEqual(['expired', 'open']);
  });
  it('if the email cannot be sent, no invite is left behind', async () => {
    const { pg, admin } = await setup();
    expect(await createInvite(pg, admin, 'o@example.com', fakeSender(true).send)).toEqual({ ok: false, reason: 'email_failed' });
    expect((await pg.query(`SELECT 1 FROM invites`)).rows).toHaveLength(0);
  });
});

describe('invite link', () => {
  it('uses APP_URL and strips a trailing slash', () => {
    process.env.APP_URL = 'https://menu.example.com/';
    expect(inviteLink('abc')).toBe('https://menu.example.com/signup?token=abc');
    delete process.env.APP_URL;
  });
});

describe('list and revoke', () => {
  it('shows open, expired and used with the right status, newest first', async () => {
    const { pg, admin } = await setup();
    const mail = fakeSender();
    await createInvite(pg, admin, 'open@example.com', mail.send);
    await pg.query(`INSERT INTO invites (token_hash, email, created_by, expires_at) VALUES ('h1','old@example.com',$1, now() - interval '1 minute')`, [admin]);
    await pg.query(`INSERT INTO invites (token_hash, email, created_by, expires_at, used_at) VALUES ('h2','done@example.com',$1, now() + interval '5 minutes', now())`, [admin]);
    const byEmail = Object.fromEntries((await listInvites(pg)).map((i) => [i.email, i.status]));
    expect(byEmail).toEqual({ 'open@example.com': 'open', 'old@example.com': 'expired', 'done@example.com': 'used' });
  });
  it('revoking an open invite closes it; unknown, used and already-closed ones return false', async () => {
    const { pg, admin } = await setup();
    await createInvite(pg, admin, 'o@example.com', fakeSender().send);
    const [open] = await listInvites(pg);
    expect(await revokeInvite(pg, open.id)).toBe(true);
    expect((await listInvites(pg))[0].status).toBe('expired');
    expect(await revokeInvite(pg, open.id)).toBe(false);
    expect(await revokeInvite(pg, '00000000-0000-0000-0000-000000000000')).toBe(false);
    const used = (await pg.query(`INSERT INTO invites (token_hash, email, created_by, expires_at, used_at) VALUES ('h3','u@example.com',$1, now() + interval '5 minutes', now()) RETURNING id`, [admin])).rows[0] as { id: string };
    expect(await revokeInvite(pg, used.id)).toBe(false);
    expect((await listInvites(pg)).find((i) => i.id === used.id)?.status).toBe('used');
  });
});
