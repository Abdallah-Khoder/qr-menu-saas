import type { Db } from './db';

export type AdminStats = { restaurants: number; active: number; suspended: number; openInvites: number };

export async function getAdminStats(db: Db): Promise<AdminStats> {
  const res = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM restaurants)::int AS restaurants,
       (SELECT COUNT(*) FROM restaurants WHERE status = 'active')::int AS active,
       (SELECT COUNT(*) FROM restaurants WHERE status = 'suspended')::int AS suspended,
       (SELECT COUNT(*) FROM invites WHERE used_at IS NULL AND expires_at > now())::int AS "openInvites"`,
  );
  return res.rows[0];
}
