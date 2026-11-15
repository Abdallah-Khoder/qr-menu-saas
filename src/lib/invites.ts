import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';
import type { Mail, Sender } from './email';
import { isValidEmail } from './credentials.mjs';

export const INVITE_MINUTES = 20;

export type InviteStatus = 'open' | 'used' | 'expired';
export type InviteRow = { id: string; email: string; status: InviteStatus; created_at: string; expires_at: string };

/** The token is only ever stored as this hash: a database leak cannot reveal working links. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function inviteLink(token: string): string {
  const base = process.env.APP_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  if (!base) throw new Error('APP_URL is not set');
  return `${base.replace(/\/$/, '')}/signup?token=${token}`;
}

export function inviteMail(email: string, link: string): Mail {
  return {
    to: email,
    subject: 'دعوة للانضمام إلى منيو QR',
    text: `تمت دعوتك لإنشاء حساب مطعمك على منيو QR.\n\nافتح الرابط التالي لإنشاء الحساب:\n${link}\n\nالرابط صالح لمدة ${INVITE_MINUTES} دقيقة فقط، ويُستعمل مرة واحدة.\nإذا لم تكن تتوقع هذه الدعوة، تجاهل الرسالة.`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
<p>تمت دعوتك لإنشاء حساب مطعمك على <b>منيو QR</b>.</p>
<p><a href="${link}" style="display:inline-block;background:#c2542d;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">إنشاء الحساب</a></p>
<p style="color:#7a6a5b">الرابط صالح لمدة ${INVITE_MINUTES} دقيقة فقط، ويُستعمل مرة واحدة.<br>إذا لم تكن تتوقع هذه الدعوة، تجاهل الرسالة.</p></div>`,
  };
}

export type CreateInviteResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_email' | 'already_registered' | 'email_failed' };

/**
 * Creates an invite and emails the link. The token goes ONLY into the email: it is never
 * returned to the browser, so not even the admin's page ever holds a working link.
 */
export async function createInvite(db: Db, adminId: string, emailInput: string, send: Sender): Promise<CreateInviteResult> {
  const email = emailInput.trim().toLowerCase();
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email' };

  const taken = await db.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (taken.rows.length > 0) return { ok: false, reason: 'already_registered' };

  const token = randomBytes(32).toString('base64url');
  const link = inviteLink(token);

  // One live invite per email: an older open link stops working when a new one is made.
  await db.query(`UPDATE invites SET expires_at = now() WHERE email = $1 AND used_at IS NULL AND expires_at > now()`, [email]);
  const inserted = await db.query(
    `INSERT INTO invites (token_hash, email, created_by, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(mins => $4)) RETURNING id`,
    [hashToken(token), email, adminId, INVITE_MINUTES],
  );

  try {
    await send(inviteMail(email, link));
  } catch (error) {
    console.error('Invite email failed:', error instanceof Error ? error.message : error);
    // No email went out, so the invite is useless: do not leave it open.
    await db.query(`DELETE FROM invites WHERE id = $1`, [inserted.rows[0].id]);
    return { ok: false, reason: 'email_failed' };
  }
  return { ok: true };
}

/** Newest first. One query; the status is computed by the database. */
export async function listInvites(db: Db): Promise<InviteRow[]> {
  const res = await db.query(
    `SELECT id, email, created_at, expires_at,
            CASE WHEN used_at IS NOT NULL THEN 'used'
                 WHEN expires_at <= now() THEN 'expired'
                 ELSE 'open' END AS status
     FROM invites ORDER BY created_at DESC LIMIT 100`,
  );
  return res.rows;
}

/** Cancels an open invite. Returns false if it does not exist or is no longer open. */
export async function revokeInvite(db: Db, id: string): Promise<boolean> {
  const res = await db.query(
    `UPDATE invites SET expires_at = now() WHERE id = $1 AND used_at IS NULL AND expires_at > now() RETURNING id`,
    [id],
  );
  return res.rows.length > 0;
}
