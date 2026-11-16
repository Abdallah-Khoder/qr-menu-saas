import { randomUUID } from 'node:crypto';
import type { Db } from './db';
import { hashToken } from './invites';
import { hashPassword } from './password.mjs';
import { makeSlug } from './slug';

/** The email the invite was made for, if the link is still valid (not used, not expired). */
export async function getInviteEmail(db: Db, token: string): Promise<string | null> {
  const res = await db.query(
    `SELECT email FROM invites
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() AND email IS NOT NULL`,
    [hashToken(token)],
  );
  return res.rows[0]?.email ?? null;
}

export type SignUpResult = { ok: true; userId: string } | { ok: false; reason: 'invalid_link' };

const MAX_SLUG_TRIES = 3;

function violatedConstraint(e: unknown): string | null {
  const err = e as { code?: string; constraint?: string; message?: string };
  if (err?.code !== '23505') return null;
  return err.constraint ?? err.message ?? '';
}

/**
 * Turns a valid invite into an account + restaurant.
 *
 * Everything happens in ONE SQL statement: use up the invite, create the user, create the
 * restaurant. PostgreSQL runs one statement as a single unit, so there is never a half-made
 * account (e.g. a used invite with no user), and the Neon HTTP driver needs no transaction for it.
 *
 * Two people sending the same link at the same moment: the UPDATE locks the invite row, the
 * second one waits, then re-checks "used_at IS NULL", finds it used and gets nothing back.
 * So only one of them can succeed.
 */
export async function signUpOwner(
  db: Db,
  input: { token: string; name: string; password: string },
  makeSlugFn: (name: string) => string = makeSlug,
): Promise<SignUpResult> {
  const name = input.name.trim(); // shown exactly as typed, only the outer spaces are removed
  const passwordHash = await hashPassword(input.password); // slow on purpose, done before the statement
  const userId = randomUUID();

  for (let attempt = 1; attempt <= MAX_SLUG_TRIES; attempt++) {
    try {
      const res = await db.query(
        `WITH inv AS (
           UPDATE invites SET used_at = now(), used_by = $2::uuid
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() AND email IS NOT NULL
           RETURNING email
         ), usr AS (
           INSERT INTO users (id, email, password_hash, role, email_verified_at)
           SELECT $2::uuid, inv.email, $3, 'owner', now() FROM inv
           RETURNING id
         ), rest AS (
           INSERT INTO restaurants (owner_id, name, public_slug)
           SELECT usr.id, $4, $5 FROM usr
           RETURNING id
         )
         SELECT (SELECT id FROM usr) AS user_id, (SELECT id FROM rest) AS restaurant_id`,
        [hashToken(input.token), userId, passwordHash, name, makeSlugFn(name)],
      );
      const row = res.rows[0];
      return row?.user_id ? { ok: true, userId: row.user_id } : { ok: false, reason: 'invalid_link' };
    } catch (e) {
      const constraint = violatedConstraint(e);
      if (constraint === null) throw e;
      // The invite is NOT used up (the whole statement was undone).
      if (constraint.includes('public_slug') && attempt < MAX_SLUG_TRIES) continue; // unlucky random link: try another
      if (constraint.includes('users_email')) return { ok: false, reason: 'invalid_link' }; // already registered
      throw e;
    }
  }
  throw new Error('could not find a free public link');
}
