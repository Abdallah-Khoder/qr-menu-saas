import type { Db } from './db';
import { parseFacebook, parseInstagram, parseMapUrl, parsePhone } from './owner-input';
import { hasLetterOrDigit } from './slugify';

// Every function here takes the OWNER's id (from his login), never a restaurant id from the request.
// The restaurant is found inside the same SQL statement, so no query can reach another restaurant.
const MY_RESTAURANT = `(SELECT id FROM restaurants WHERE owner_id = $1)`;
// For every WRITE: a suspended restaurant matches nothing, so the statement changes nothing.
const MY_ACTIVE_RESTAURANT = `(SELECT id FROM restaurants WHERE owner_id = $1 AND status = 'active')`;

export const MAX_CATEGORIES = 50;
export const NAME_MAX = 80;

export type Currencies = 'USD' | 'LBP' | 'BOTH';
export type Result = { ok: true } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): Result => ({ ok: false, status, error });

export type OwnerRestaurant = {
  id: string; name: string; public_slug: string; status: 'active' | 'suspended';
  currencies: Currencies; phone_number: string | null; map_url: string | null;
  instagram_url: string | null; facebook_url: string | null;
};

export async function getOwnerRestaurant(db: Db, ownerId: string): Promise<OwnerRestaurant | null> {
  const res = await db.query(
    `SELECT id, name, public_slug, status, currencies, phone_number, map_url, instagram_url, facebook_url FROM restaurants WHERE owner_id = $1`,
    [ownerId],
  );
  return res.rows[0] ?? null;
}

export const SUSPENDED_MESSAGE = 'تم إيقاف مطعمك من الإدارة، فلا يمكنك التعديل حتى إعادة التفعيل.';

/**
 * A write changed nothing: say why. A suspended restaurant gets a clear 403, anything else keeps the
 * answer the caller had (404 / 409). Only runs on the failure path, so normal requests pay nothing.
 */
async function explain(db: Db, ownerId: string, otherwise: Result): Promise<Result> {
  const res = await db.query(`SELECT status FROM restaurants WHERE owner_id = $1`, [ownerId]);
  return res.rows[0]?.status === 'suspended' ? fail(403, SUSPENDED_MESSAGE) : otherwise;
}

function checkName(raw: string, what: string): { ok: true; name: string } | { ok: false; error: string } {
  const name = raw.trim();
  const length = Array.from(name).length;
  if (length < 1 || length > NAME_MAX || !hasLetterOrDigit(name)) {
    return { ok: false, error: `${what} مطلوب (حتى ${NAME_MAX} حرفًا، ويحتوي على حرف أو رقم)` };
  }
  return { ok: true, name };
}

/**
 * Saves the restaurant settings. The public link (slug) never changes, even when the name does,
 * so links already printed on tables keep working.
 * Choosing a currency is refused while some item or size has no price in it: the same statement
 * counts them and only updates when there are none.
 */
export async function saveSettings(
  db: Db,
  ownerId: string,
  input: { name: string; currencies: Currencies; phone: string; mapUrl: string; instagram: string; facebook: string },
): Promise<Result> {
  const name = checkName(input.name, 'اسم المطعم');
  if (!name.ok) return fail(400, name.error);
  const phone = parsePhone(input.phone);
  if (!phone.ok) return fail(400, phone.error);
  const map = parseMapUrl(input.mapUrl);
  if (!map.ok) return fail(400, map.error);
  const instagram = parseInstagram(input.instagram);
  if (!instagram.ok) return fail(400, instagram.error);
  const facebook = parseFacebook(input.facebook);
  if (!facebook.ok) return fail(400, facebook.error);

  const res = await db.query(
    `WITH r AS (SELECT id FROM restaurants WHERE owner_id = $1 AND status = 'active'),
     missing AS (
       SELECT (
         SELECT count(*) FROM items i
         WHERE i.restaurant_id = (SELECT id FROM r)
           AND NOT EXISTS (SELECT 1 FROM item_sizes s WHERE s.item_id = i.id)
           AND ((($2::text IN ('USD','BOTH')) AND i.price_usd IS NULL) OR (($2::text IN ('LBP','BOTH')) AND i.price_lbp IS NULL))
       ) + (
         SELECT count(*) FROM item_sizes s
         WHERE s.restaurant_id = (SELECT id FROM r)
           AND ((($2::text IN ('USD','BOTH')) AND s.price_usd IS NULL) OR (($2::text IN ('LBP','BOTH')) AND s.price_lbp IS NULL))
       ) AS n
     ),
     upd AS (
       UPDATE restaurants SET name = $3, currencies = $2::text, phone_number = $4, map_url = $5,
           instagram_url = $6, facebook_url = $7
       WHERE id = (SELECT id FROM r) AND (SELECT n FROM missing) = 0
       RETURNING id
     )
     SELECT (SELECT id FROM r) AS restaurant_id, (SELECT n FROM missing)::int AS missing,
            EXISTS (SELECT 1 FROM upd) AS updated`,
    [ownerId, input.currencies, name.name, phone.value, map.value, instagram.value, facebook.value],
  );
  const row = res.rows[0];
  if (!row?.restaurant_id) return explain(db, ownerId, fail(404, 'المطعم غير موجود'));
  if (row.missing > 0) {
    return fail(409, `لا يمكن اختيار هذه العملة: يوجد ${row.missing} منتج أو حجم بلا سعر بها. أكمل الأسعار أولًا.`);
  }
  return { ok: true };
}

// ---- categories ----

export type CategoryRow = { id: string; name: string; sort_order: number; item_count: number };

/** All categories with the number of items in each: one query. */
export async function listCategories(db: Db, ownerId: string): Promise<CategoryRow[]> {
  const res = await db.query(
    `SELECT c.id, c.name, c.sort_order, count(i.id)::int AS item_count
     FROM categories c
     LEFT JOIN items i ON i.category_id = c.id AND i.restaurant_id = c.restaurant_id
     WHERE c.restaurant_id = ${MY_RESTAURANT}
     GROUP BY c.id ORDER BY c.sort_order, c.id`,
    [ownerId],
  );
  return res.rows;
}

export async function createCategory(db: Db, ownerId: string, nameInput: string): Promise<Result> {
  const name = checkName(nameInput, 'اسم القسم');
  if (!name.ok) return fail(400, name.error);
  const res = await db.query(
    `INSERT INTO categories (restaurant_id, name, sort_order)
     SELECT r.id, $2, COALESCE((SELECT MAX(sort_order) + 1 FROM categories WHERE restaurant_id = r.id), 0)
     FROM restaurants r
     WHERE r.owner_id = $1 AND r.status = 'active' AND (SELECT count(*) FROM categories WHERE restaurant_id = r.id) < $3
     RETURNING id`,
    [ownerId, name.name, MAX_CATEGORIES],
  );
  return res.rows.length > 0
    ? { ok: true }
    : explain(db, ownerId, fail(409, `لا يمكن إضافة المزيد (الحد الأقصى ${MAX_CATEGORIES} قسمًا)`));
}

export async function renameCategory(db: Db, ownerId: string, id: string, nameInput: string): Promise<Result> {
  const name = checkName(nameInput, 'اسم القسم');
  if (!name.ok) return fail(400, name.error);
  const res = await db.query(
    `UPDATE categories SET name = $3 WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT} RETURNING id`,
    [ownerId, id, name.name],
  );
  return res.rows.length > 0 ? { ok: true } : explain(db, ownerId, fail(404, 'القسم غير موجود'));
}

/** Deletes the category AND its items (the database cascades). */
export async function deleteCategory(db: Db, ownerId: string, id: string): Promise<Result> {
  const res = await db.query(
    `DELETE FROM categories WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT} RETURNING id`,
    [ownerId, id],
  );
  return res.rows.length > 0 ? { ok: true } : explain(db, ownerId, fail(404, 'القسم غير موجود'));
}

/**
 * Moves a category one place up or down by swapping places with its neighbour.
 * One statement: it first numbers all the restaurant's categories 1..n (so duplicates or gaps
 * in sort_order cannot confuse it), then swaps two of them. At the top or bottom nothing changes.
 */
export async function moveCategory(db: Db, ownerId: string, id: string, direction: 'up' | 'down'): Promise<Result> {
  const res = await db.query(
    `WITH ranked AS (
       SELECT id, row_number() OVER (ORDER BY sort_order, id) AS pos
       FROM categories WHERE restaurant_id = ${MY_ACTIVE_RESTAURANT}
     ),
     me AS (SELECT pos FROM ranked WHERE id = $2),
     target AS (SELECT (SELECT pos FROM me) + CASE WHEN $3::text = 'up' THEN -1 ELSE 1 END AS pos)
     UPDATE categories c
     SET sort_order = CASE WHEN r.pos = (SELECT pos FROM me) THEN (SELECT pos FROM target)
                           WHEN r.pos = (SELECT pos FROM target) THEN (SELECT pos FROM me)
                           ELSE r.pos END
     FROM ranked r
     WHERE c.id = r.id AND c.restaurant_id = ${MY_ACTIVE_RESTAURANT}
       AND EXISTS (SELECT 1 FROM me)
       AND (SELECT pos FROM target) BETWEEN 1 AND (SELECT count(*) FROM ranked)
     RETURNING c.id`,
    [ownerId, id, direction],
  );
  if (res.rows.length > 0) return { ok: true };
  // nothing changed: either already at the end, or not his category
  const exists = await db.query(`SELECT 1 FROM categories WHERE id = $2 AND restaurant_id = ${MY_RESTAURANT}`, [ownerId, id]);
  if (exists.rows.length === 0) return fail(404, 'القسم غير موجود');
  return (await explain(db, ownerId, { ok: true }));
}
