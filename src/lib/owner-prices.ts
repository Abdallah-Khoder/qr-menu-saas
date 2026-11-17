import type { Db } from './db';
import { parseLbp, parseUsd } from './owner-input';
import { MY_RESTAURANT, explain, fail, getOwnerRestaurant, type Result } from './owner-menu';

// Filling in the missing prices of the currency the restaurant does not use yet, so that the owner can
// switch to it later (the settings refuse the switch while a price is missing).
// The target currency is never sent by the browser: it is always "the one the restaurant does not use".

export type Target = 'USD' | 'LBP';

export type MissingPrice = {
  item_id: string; item_name: string; category_name: string;
  label: string; // '' for an item without sizes, the size name otherwise
  known: string | null; // the price this row already has in the currency the restaurant uses
};
export type MissingPrices = { currencies: 'USD' | 'LBP' | 'BOTH'; target: Target | null; rows: MissingPrice[] };

const targetOf = (currencies: 'USD' | 'LBP' | 'BOTH'): Target | null =>
  currencies === 'USD' ? 'LBP' : currencies === 'LBP' ? 'USD' : null;

/** Every item (without sizes) and every size that has no price in the other currency: one query. */
export async function listMissingPrices(db: Db, ownerId: string): Promise<MissingPrices | null> {
  const restaurant = await getOwnerRestaurant(db, ownerId);
  if (!restaurant) return null;
  const target = targetOf(restaurant.currencies);
  if (!target) return { currencies: restaurant.currencies, target, rows: [] };
  const res = await db.query(
    `SELECT item_id, item_name, category_name, label, known FROM (
       SELECT i.id AS item_id, i.name AS item_name, c.name AS category_name, ''::text AS label,
              (CASE WHEN $2::text = 'USD' THEN i.price_lbp ELSE i.price_usd END)::text AS known,
              c.sort_order AS cs, c.id AS cid, i.sort_order AS os, 0 AS ss
       FROM items i JOIN categories c ON c.id = i.category_id AND c.restaurant_id = i.restaurant_id
       WHERE i.restaurant_id = ${MY_RESTAURANT}
         AND NOT EXISTS (SELECT 1 FROM item_sizes z WHERE z.item_id = i.id)
         AND ((($2::text = 'USD') AND i.price_usd IS NULL) OR (($2::text = 'LBP') AND i.price_lbp IS NULL))
       UNION ALL
       SELECT i.id, i.name, c.name, s.label,
              (CASE WHEN $2::text = 'USD' THEN s.price_lbp ELSE s.price_usd END)::text,
              c.sort_order, c.id, i.sort_order, s.sort_order + 1
       FROM item_sizes s
       JOIN items i ON i.id = s.item_id AND i.restaurant_id = s.restaurant_id
       JOIN categories c ON c.id = i.category_id AND c.restaurant_id = i.restaurant_id
       WHERE s.restaurant_id = ${MY_RESTAURANT}
         AND ((($2::text = 'USD') AND s.price_usd IS NULL) OR (($2::text = 'LBP') AND s.price_lbp IS NULL))
     ) t ORDER BY cs, cid, os, item_id, ss, label`,
    [ownerId, target],
  );
  return { currencies: restaurant.currencies, target, rows: res.rows };
}

export type PriceEntry = { itemId: string; label: string; price: string };

const MAX_ENTRIES = 2000;

/**
 * Saves the typed prices. ALL of them or none, in ONE statement: every entry must point to an item
 * (or size) of this owner's restaurant that still has no price in the target currency. If even one
 * does not (deleted, already filled, someone else's), nothing is saved and the owner is told to reload.
 *
 * Two saves at the same moment: the rows we are about to fill are locked (FOR UPDATE) BEFORE the count is
 * made. A second save waits, then PostgreSQL re-checks "is the price still empty?" on those rows, so the
 * count is true and a price filled by the first save is never overwritten, nor half of a batch saved.
 * (Tested once on a real PostgreSQL with two connections: the in-memory test database has only one.)
 */
export async function fillPrices(db: Db, ownerId: string, entries: PriceEntry[]): Promise<Result> {
  const restaurant = await getOwnerRestaurant(db, ownerId);
  if (!restaurant) return fail(404, 'المطعم غير موجود');
  const target = targetOf(restaurant.currencies);
  if (!target) return explain(db, ownerId, fail(409, 'لا توجد أسعار ناقصة. المطعم يستخدم العملتين.'));
  if (entries.length === 0) return explain(db, ownerId, fail(400, 'اكتب سعرًا واحدًا على الأقل'));
  if (entries.length > MAX_ENTRIES) return explain(db, ownerId, fail(400, 'عدد الأسعار كبير جدًا'));

  const seen = new Set<string>();
  const prices: string[] = [];
  for (const e of entries) {
    const key = `${e.itemId.toLowerCase()}|${e.label.trim().toUpperCase()}`; // PostgreSQL reads a UUID in any letter case as the same id
    if (seen.has(key)) return explain(db, ownerId, fail(400, 'سعر مكرّر لنفس المنتج'));
    seen.add(key);
    const parsed = target === 'USD' ? parseUsd(e.price) : parseLbp(e.price);
    if (!parsed.ok) return explain(db, ownerId, fail(400, parsed.error));
    if (parsed.value === null) return explain(db, ownerId, fail(400, 'اترك الخانات الفارغة كما هي أو اكتب فيها سعرًا صحيحًا'));
    prices.push(parsed.value);
  }

  const res = await db.query(
    `WITH r AS (
       SELECT id, CASE currencies WHEN 'USD' THEN 'LBP' ELSE 'USD' END AS target
       FROM restaurants WHERE owner_id = $1 AND status = 'active' AND currencies = $5::text
     ),
     inp AS (SELECT t.item_id, t.label, t.price FROM unnest($2::uuid[], $3::text[], $4::numeric[]) AS t(item_id, label, price)),
     item_hits AS (
       SELECT i.id, inp.price FROM inp
       JOIN items i ON i.id = inp.item_id AND i.restaurant_id = (SELECT id FROM r)
       WHERE inp.label = '' AND NOT EXISTS (SELECT 1 FROM item_sizes z WHERE z.item_id = i.id)
         AND (((SELECT target FROM r) = 'USD' AND i.price_usd IS NULL) OR ((SELECT target FROM r) = 'LBP' AND i.price_lbp IS NULL))
       ORDER BY i.id
       FOR UPDATE OF i
     ),
     size_hits AS (
       SELECT s.id, inp.price FROM inp
       JOIN item_sizes s ON s.item_id = inp.item_id AND s.label = inp.label AND s.restaurant_id = (SELECT id FROM r)
       WHERE inp.label <> ''
         AND (((SELECT target FROM r) = 'USD' AND s.price_usd IS NULL) OR ((SELECT target FROM r) = 'LBP' AND s.price_lbp IS NULL))
       ORDER BY s.id
       FOR UPDATE OF s
     ),
     ok AS (SELECT ((SELECT count(*) FROM item_hits) + (SELECT count(*) FROM size_hits)) = cardinality($2::uuid[]) AS good),
     u_items AS (
       UPDATE items i SET
         price_usd = CASE WHEN (SELECT target FROM r) = 'USD' THEN h.price ELSE i.price_usd END,
         price_lbp = CASE WHEN (SELECT target FROM r) = 'LBP' THEN h.price ELSE i.price_lbp END
       FROM item_hits h WHERE i.id = h.id AND (SELECT good FROM ok)
         AND ((SELECT target FROM r) = 'USD' AND i.price_usd IS NULL OR (SELECT target FROM r) = 'LBP' AND i.price_lbp IS NULL)
       RETURNING i.id
     ),
     u_sizes AS (
       UPDATE item_sizes s SET
         price_usd = CASE WHEN (SELECT target FROM r) = 'USD' THEN h.price ELSE s.price_usd END,
         price_lbp = CASE WHEN (SELECT target FROM r) = 'LBP' THEN h.price ELSE s.price_lbp END
       FROM size_hits h WHERE s.id = h.id AND (SELECT good FROM ok)
         AND ((SELECT target FROM r) = 'USD' AND s.price_usd IS NULL OR (SELECT target FROM r) = 'LBP' AND s.price_lbp IS NULL)
       RETURNING s.id
     )
     SELECT (SELECT id FROM r) AS restaurant_id, (SELECT good FROM ok) AS good`,
    [ownerId, entries.map((e) => e.itemId), entries.map((e) => e.label.trim().toUpperCase()), prices, restaurant.currencies],
  );
  const row = res.rows[0];
  if (row?.restaurant_id && row.good) return { ok: true };
  return explain(db, ownerId, fail(409, 'تغيّرت المنتجات أو إعدادات المطعم. أعد تحميل الصفحة وحاول مرة أخرى.'));
}
