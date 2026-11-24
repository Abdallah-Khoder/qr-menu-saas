import type { Db } from './db';
import { forgetUnusedImages } from './image-cleanup';
import { MAX_LOCATIONS } from './locations';
import { parseFacebook, parseInstagram, parseMapUrl, parsePhone, parseTiktok } from './owner-input';
import { hasLetterOrDigit } from './slugify';

// Every function here takes the OWNER's id (from his login), never a restaurant id from the request.
// The restaurant is found inside the same SQL statement, so no query can reach another restaurant.
export const MY_RESTAURANT = `(SELECT id FROM restaurants WHERE owner_id = $1)`;
// For every WRITE: a suspended restaurant matches nothing, so the statement changes nothing.
export const MY_ACTIVE_RESTAURANT = `(SELECT id FROM restaurants WHERE owner_id = $1 AND status = 'active')`;

export const MAX_CATEGORIES = 50;
export { MAX_LOCATIONS }; // branches of one restaurant (see locations.ts)
export const NAME_MAX = 80;

export type Currencies = 'USD' | 'LBP' | 'BOTH';
export type Direction = 'rtl' | 'ltr'; // which way the public menu reads
export const isDirection = (v: unknown): v is Direction => v === 'rtl' || v === 'ltr';
export type Result = { ok: true } | { ok: false; status: number; error: string };
export const fail = (status: number, error: string): Result => ({ ok: false, status, error });

export type OwnerRestaurant = {
  id: string; name: string; public_slug: string; status: 'active' | 'suspended';
  currencies: Currencies; phone_number: string | null;
  instagram_url: string | null; facebook_url: string | null; tiktok_url: string | null; menu_direction: Direction;
  locations: { name: string; map_url: string }[]; // the branches, in the order the owner chose
};

export async function getOwnerRestaurant(db: Db, ownerId: string): Promise<OwnerRestaurant | null> {
  const res = await db.query(
    `SELECT id, name, public_slug, status, currencies, phone_number, instagram_url, facebook_url, tiktok_url, menu_direction,
       COALESCE((SELECT json_agg(json_build_object('name', l.name, 'map_url', l.map_url) ORDER BY l.sort_order, l.id)
                 FROM restaurant_locations l WHERE l.restaurant_id = restaurants.id), '[]'::json) AS locations
     FROM restaurants WHERE owner_id = $1`,
    [ownerId],
  );
  return res.rows[0] ?? null;
}

export const SUSPENDED_MESSAGE = 'تم إيقاف مطعمك من الإدارة، فلا يمكنك التعديل حتى إعادة التفعيل.';

/**
 * A write changed nothing: say why. A suspended restaurant gets a clear 403, anything else keeps the
 * answer the caller had (404 / 409). Only runs on the failure path, so normal requests pay nothing.
 */
export async function explain(db: Db, ownerId: string, otherwise: Result): Promise<Result> {
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

export type LocationInput = { name: string; mapUrl: string };

/**
 * The branches as the owner typed them. A row left completely empty is ignored (the "add a branch" row he did not
 * fill). Every other row needs a name and a valid map link; the first problem is reported with the number of its row.
 */
function parseLocations(
  list: LocationInput[],
): { ok: true; value: { name: string; map_url: string; sort_order: number }[] } | { ok: false; error: string } {
  // `shown` = the row as the owner sees it on the page (a blank row above still counts), `sort_order` = the place among the saved ones
  const rows = list.map((l, i) => ({ ...l, shown: i + 1 })).filter((l) => l.name.trim() !== '' || l.mapUrl.trim() !== '');
  if (rows.length > MAX_LOCATIONS) return { ok: false, error: `لا يمكن إضافة أكثر من ${MAX_LOCATIONS} فرعًا` };
  const value: { name: string; map_url: string; sort_order: number }[] = [];
  for (const [i, row] of rows.entries()) {
    const at = `الفرع رقم ${row.shown}: `;
    const name = checkName(row.name, 'اسم الفرع');
    if (!name.ok) return { ok: false, error: at + name.error };
    const map = parseMapUrl(row.mapUrl);
    if (!map.ok) return { ok: false, error: at + map.error };
    if (map.value === null) return { ok: false, error: at + 'رابط الخريطة مطلوب' };
    value.push({ name: name.name, map_url: map.value, sort_order: i });
  }
  return { ok: true, value };
}

/**
 * Saves the restaurant settings. The public link (slug) never changes, even when the name does,
 * so links already printed on tables keep working.
 * Choosing a currency is refused while some item or size has no price in it: the same statement
 * counts them and only updates when there are none.
 * `direction` is optional: a settings page that was opened before this field existed still saves, and the
 * restaurant keeps the direction it has. `locations` (the branches) is optional the same way: left out, the branches
 * stay as they are; given, it REPLACES the whole list, in the same statement as the rest (all saved or nothing saved).
 */
export async function saveSettings(
  db: Db,
  ownerId: string,
  input: { name: string; currencies: Currencies; phone: string; instagram: string; facebook: string; tiktok: string; direction?: Direction; locations?: LocationInput[] },
): Promise<Result> {
  const name = checkName(input.name, 'اسم المطعم');
  if (!name.ok) return fail(400, name.error);
  if (input.direction !== undefined && !isDirection(input.direction)) return fail(400, 'اتجاه القائمة غير صالح');
  const phone = parsePhone(input.phone);
  if (!phone.ok) return fail(400, phone.error);
  const places = input.locations === undefined ? null : parseLocations(input.locations);
  if (places && !places.ok) return fail(400, places.error);
  const instagram = parseInstagram(input.instagram);
  if (!instagram.ok) return fail(400, instagram.error);
  const facebook = parseFacebook(input.facebook);
  if (!facebook.ok) return fail(400, facebook.error);
  const tiktok = parseTiktok(input.tiktok);
  if (!tiktok.ok) return fail(400, tiktok.error);

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
       UPDATE restaurants SET name = $3, currencies = $2::text, phone_number = $4,
           instagram_url = $5, facebook_url = $6, tiktok_url = $7, menu_direction = COALESCE($8::text, menu_direction)
       WHERE id = (SELECT id FROM r) AND (SELECT n FROM missing) = 0
       RETURNING id
     ),
     gone AS (
       DELETE FROM restaurant_locations WHERE $9::jsonb IS NOT NULL AND restaurant_id IN (SELECT id FROM upd)
     ),
     added AS (
       INSERT INTO restaurant_locations (restaurant_id, name, map_url, sort_order)
       SELECT u.id, x.name, x.map_url, x.sort_order
       FROM upd u, jsonb_to_recordset($9::jsonb) AS x(name text, map_url text, sort_order int)
       ORDER BY x.sort_order LIMIT ${MAX_LOCATIONS}
     )
     SELECT (SELECT id FROM r) AS restaurant_id, (SELECT n FROM missing)::int AS missing,
            EXISTS (SELECT 1 FROM upd) AS updated`,
    [ownerId, input.currencies, name.name, phone.value, instagram.value, facebook.value, tiktok.value, input.direction ?? null, places ? JSON.stringify(places.value) : null],
  );
  const row = res.rows[0];
  if (!row?.restaurant_id) return explain(db, ownerId, fail(404, 'المطعم غير موجود'));
  if (row.missing > 0) {
    return fail(409, `لا يمكن اختيار هذه العملة: يوجد ${row.missing} منتج أو حجم بلا سعر بها. أكمل الأسعار أولًا من صفحة «إكمال الأسعار» في الإعدادات.`);
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
  // The photos of its items are read in the same statement (the items disappear with the category).
  const res = await db.query(
    `WITH photos AS (SELECT image_url FROM items WHERE category_id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT} AND image_url IS NOT NULL)
     DELETE FROM categories WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT}
     RETURNING id, (SELECT COALESCE(array_agg(image_url), '{}') FROM photos) AS photos`,
    [ownerId, id],
  );
  if (res.rows.length === 0) return explain(db, ownerId, fail(404, 'القسم غير موجود'));
  await forgetUnusedImages(db, ownerId, res.rows[0].photos);
  return { ok: true };
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
  // A suspended owner gets the suspension answer whatever the id (same as rename and delete).
  return explain(db, ownerId, exists.rows.length === 0 ? fail(404, 'القسم غير موجود') : { ok: true });
}
