import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate-lib.mjs';

/** A real PostgreSQL in memory (no account, no internet) with every migration applied. */
export async function makeDb() {
  const pg = new PGlite();
  await migrate(pg, 'db/migrations');
  return pg;
}

/** A valid public slug: readable name + dash + 10 random-looking characters. */
export const slug = (name: string) => `${name}-k3x9qp7vtz`;

type Row = Record<string, unknown>;
type Id = { id: string };

/** Insert helpers: each returns the new row's id (a UUID). */
export const add = {
  async owner(pg: PGlite, email: string) {
    const res = await pg.query<Id>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash', 'owner') RETURNING id`,
      [email],
    );
    return res.rows[0].id;
  },
  async superAdmin(pg: PGlite, email = 'root@example.com') {
    const res = await pg.query<Id>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash', 'super_admin') RETURNING id`,
      [email],
    );
    return res.rows[0].id;
  },
  async restaurant(pg: PGlite, ownerId: string, publicSlug: string, over: Row = {}) {
    const r = { name: 'Some restaurant', status: null, currencies: null, ...over };
    const res = await pg.query<Id>(
      `INSERT INTO restaurants (owner_id, name, public_slug, status, currencies)
       VALUES ($1, $2, $3, COALESCE($4, 'active'), COALESCE($5, 'USD')) RETURNING id`,
      [ownerId, r.name, publicSlug, r.status, r.currencies],
    );
    return res.rows[0].id;
  },
  /** An owner account plus its restaurant, in one call. */
  async tenant(pg: PGlite, name: string) {
    const ownerId = await add.owner(pg, `${name}@example.com`);
    const restaurantId = await add.restaurant(pg, ownerId, slug(name));
    return { ownerId, restaurantId };
  },
  async category(pg: PGlite, restaurantId: string, name = 'Crepes') {
    const res = await pg.query<Id>(
      `INSERT INTO categories (restaurant_id, name) VALUES ($1, $2) RETURNING id`,
      [restaurantId, name],
    );
    return res.rows[0].id;
  },
  async item(pg: PGlite, restaurantId: string, categoryId: string, priceUsd: number | string | null = '3.50') {
    const res = await pg.query<Id>(
      `INSERT INTO items (restaurant_id, category_id, name, price_usd) VALUES ($1, $2, 'Burger', $3) RETURNING id`,
      [restaurantId, categoryId, priceUsd],
    );
    return res.rows[0].id;
  },
  async size(pg: PGlite, restaurantId: string, itemId: string, label: string, priceUsd: string | null = '4.00', priceLbp: string | null = null) {
    const res = await pg.query<Id>(
      `INSERT INTO item_sizes (restaurant_id, item_id, label, price_usd, price_lbp) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [restaurantId, itemId, label, priceUsd, priceLbp],
    );
    return res.rows[0].id;
  },
};

export const count = async (pg: PGlite, table: string) =>
  (await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
