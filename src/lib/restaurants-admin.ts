import type { Db } from './db';

export type RestaurantRow = {
  id: string;
  name: string;
  public_slug: string;
  status: 'active' | 'suspended';
  created_at: string;
  owner_email: string;
};

/** All restaurants with their owner's email: one query (no query per row). */
export async function listRestaurants(db: Db): Promise<RestaurantRow[]> {
  const res = await db.query(
    `SELECT r.id, r.name, r.public_slug, r.status, r.created_at, u.email AS owner_email
     FROM restaurants r JOIN users u ON u.id = r.owner_id
     ORDER BY r.created_at DESC LIMIT 200`,
  );
  return res.rows;
}

export async function setRestaurantStatus(db: Db, id: string, status: 'active' | 'suspended'): Promise<boolean> {
  const res = await db.query(`UPDATE restaurants SET status = $2 WHERE id = $1 RETURNING id`, [id, status]);
  return res.rows.length > 0;
}

/**
 * The only delete: the owner's ACCOUNT, and with it his restaurant, categories, items, sizes and codes (the
 * database cascades every one of them, so nothing is left behind). The same email can be invited again afterwards.
 * (A "restaurant only" delete was removed: it left an account that could not make a new restaurant, could not
 * be invited again and was not even listed, so nobody could delete it.)
 * Only role 'owner': this can never delete a super-admin.
 */
export async function deleteOwnerAccount(db: Db, restaurantId: string): Promise<boolean> {
  const res = await db.query(
    `DELETE FROM users WHERE role = 'owner' AND id = (SELECT owner_id FROM restaurants WHERE id = $1) RETURNING id`,
    [restaurantId],
  );
  return res.rows.length > 0;
}
