import { randomBytes } from 'node:crypto';
import { appUrl } from './app-url';
import { isValidEmail } from './credentials.mjs';
import type { Db } from './db';
import type { Mail } from './email';
import { hashToken } from './invites';
import { hashPassword } from './password.mjs';
import { clearFailures } from './rate-limit';

export const RESET_MINUTES = 20;

export const resetLink = (token: string) => `${appUrl()}/reset?token=${token}`;

export function resetMail(email: string, link: string): Mail {
  return {
    to: email,
    subject: 'إعادة تعيين كلمة المرور - منيو QR',
    text: `وصلنا طلب لإعادة تعيين كلمة المرور لحسابك على منيو QR.\n\nافتح الرابط التالي لاختيار كلمة مرور جديدة:\n${link}\n\nالرابط صالح لمدة ${RESET_MINUTES} دقيقة فقط، ويُستعمل مرة واحدة.\nإذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.`,
    html: `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">
<p>وصلنا طلب لإعادة تعيين كلمة المرور لحسابك على <b>منيو QR</b>.</p>
<p><a href="${link}" style="display:inline-block;background:#c2542d;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">اختيار كلمة مرور جديدة</a></p>
<p style="color:#7a6a5b">الرابط صالح لمدة ${RESET_MINUTES} دقيقة فقط، ويُستعمل مرة واحدة.<br>إذا لم تطلب ذلك، تجاهل هذه الرسالة وستبقى كلمة مرورك كما هي.</p></div>`,
  };
}

/**
 * Makes a reset link for an OWNER's email and returns the mail to send, or null when there is nothing to send
 * (unknown email, not an owner, not verified). The caller answers the person the same way in every case.
 *
 * Only owners: the super admin's password is changed by the script on the admin's own computer, so a
 * stolen mailbox can never be turned into the most powerful account.
 * The token goes ONLY into the mail; the database keeps its hash. One live link per person: making a new
 * one cancels the older one (both in one statement).
 */
export async function createResetMail(db: Db, emailInput: string): Promise<Mail | null> {
  const email = emailInput.trim().toLowerCase();
  if (!isValidEmail(email)) return null;
  const found = await db.query(
    `SELECT id FROM users WHERE email = $1 AND role = 'owner' AND email_verified_at IS NOT NULL`,
    [email],
  );
  const userId = found.rows[0]?.id;
  if (!userId) return null;

  // The mail is built BEFORE anything is written: if it cannot be built (APP_URL missing) nothing is touched
  // and the older link keeps working.
  const token = randomBytes(32).toString('base64url');
  const mail = resetMail(email, resetLink(token));
  await db.query(
    `WITH old AS (DELETE FROM email_codes WHERE user_id = $1 AND purpose = 'reset_password')
     INSERT INTO email_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, 'reset_password', $2, now() + make_interval(mins => $3))`,
    [userId, hashToken(token), RESET_MINUTES],
  );
  return mail;
}

/** The email a still-valid reset link belongs to (to show it on the page), or null (unknown, used, expired). */
export async function getResetEmail(db: Db, token: string): Promise<string | null> {
  const res = await db.query(
    `SELECT u.email FROM email_codes c JOIN users u ON u.id = c.user_id
     WHERE c.code_hash = $1 AND c.purpose = 'reset_password' AND c.expires_at > now() AND u.role = 'owner'`,
    [hashToken(token)],
  );
  return res.rows[0]?.email ?? null;
}

/**
 * Sets the new password. In ONE statement: use up the link (it is deleted, so it works once even when two
 * people send it at the same moment), change the password, remember the moment (old logins stop working),
 * and cancel any other link of the same person. Otherwise a failed step could leave a used link with the
 * old password, or a new password with a link that still works.
 */
export async function resetPassword(db: Db, token: string, newPassword: string): Promise<{ ok: true } | { ok: false }> {
  const passwordHash = await hashPassword(newPassword); // slow on purpose, done before the statement
  const res = await db.query(
    `WITH tok AS (
       DELETE FROM email_codes
       WHERE code_hash = $1 AND purpose = 'reset_password' AND expires_at > now()
       RETURNING user_id
     ), upd AS (
       UPDATE users SET password_hash = $2, password_changed_at = now()
       FROM tok WHERE users.id = tok.user_id AND users.role = 'owner'
       RETURNING users.id, users.email
     ), other AS (
       DELETE FROM email_codes
       WHERE purpose = 'reset_password' AND code_hash <> $1 AND user_id IN (SELECT id FROM upd)
     )
     SELECT id, email FROM upd`,
    [hashToken(token), passwordHash],
  );
  const row = res.rows[0];
  if (!row) return { ok: false };
  // He just proved he owns the mailbox: forget his wrong-password counter so he can log in at once.
  try {
    await clearFailures(db, [`email:${row.email}`]);
  } catch (e) {
    console.error('reset: could not clear the failed-login counter', e);
  }
  return { ok: true };
}
