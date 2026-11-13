import { PGlite } from '@electric-sql/pglite';
import { migrate } from '../scripts/migrate-lib.mjs';

/** A real PostgreSQL in memory (no account, no internet) with every migration applied. */
export async function makeDb() {
  const pg = new PGlite();
  await migrate(pg, 'db/migrations');
  return pg;
}

type Row = Record<string, unknown>;

/** Insert helpers: each returns the new row's id. */
export const add = {
  async restaurant(pg: PGlite, slug: string, over: Row = {}) {
    const r = { name: `Rest ${slug}`, public_slug: slug, ...over };
    const res = await pg.query<{ id: number }>(
      `INSERT INTO restaurants (name, public_slug, status, currency)
       VALUES ($1, $2, COALESCE($3, 'active'), COALESCE($4, 'USD')) RETURNING id`,
      [r.name, r.public_slug, r.status ?? null, r.currency ?? null],
    );
    return res.rows[0].id;
  },
  async owner(pg: PGlite, email: string, restaurantId: number) {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, role, restaurant_id)
       VALUES ($1, 'hash', 'owner', $2) RETURNING id`,
      [email, restaurantId],
    );
    return res.rows[0].id;
  },
  async superAdmin(pg: PGlite, email = 'root@example.com') {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, 'hash', 'super_admin') RETURNING id`,
      [email],
    );
    return res.rows[0].id;
  },
  async category(pg: PGlite, restaurantId: number, name = 'Crepes') {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO categories (restaurant_id, name_ar, name_en) VALUES ($1, $2, $2) RETURNING id`,
      [restaurantId, name],
    );
    return res.rows[0].id;
  },
  async item(pg: PGlite, restaurantId: number, categoryId: number, price: number | null = 350) {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO items (restaurant_id, category_id, name_ar, name_en, price_minor)
       VALUES ($1, $2, 'صنف', 'Item', $3) RETURNING id`,
      [restaurantId, categoryId, price],
    );
    return res.rows[0].id;
  },
  async size(pg: PGlite, restaurantId: number, itemId: number, label: string, price = 400) {
    const res = await pg.query<{ id: number }>(
      `INSERT INTO item_sizes (restaurant_id, item_id, label, price_minor) VALUES ($1, $2, $3, $4) RETURNING id`,
      [restaurantId, itemId, label, price],
    );
    return res.rows[0].id;
  },
};

export const count = async (pg: PGlite, table: string) =>
  (await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table}`)).rows[0].n;
