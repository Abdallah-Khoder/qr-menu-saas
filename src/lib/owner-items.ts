import type { Db } from './db';
import { parseLbp, parseUsd } from './owner-input';
import {
  MY_ACTIVE_RESTAURANT, MY_RESTAURANT, NAME_MAX, explain, fail, getOwnerRestaurant,
  type Currencies, type Result,
} from './owner-menu';
import { DESCRIPTION_MAX, MAX_ITEMS, MAX_SIZES } from './item-limits';
import { hasLetterOrDigit } from './slugify';

// Items and their sizes. Same rules as the rest of the owner code: the restaurant is found from the
// owner's id inside the SQL, a suspended restaurant matches nothing, and the whole save is ONE statement.

export { MAX_ITEMS, MAX_SIZES, DESCRIPTION_MAX };

export type ItemInput = {
  categoryId: string;
  name: string;
  description: string;
  available: boolean;
  priceUsd: string;
  priceLbp: string;
  sizes: { label: string; priceUsd: string; priceLbp: string }[];
};

type Clean = {
  name: string; description: string; usd: string | null; lbp: string | null;
  labels: string[]; usds: (string | null)[]; lbps: (string | null)[];
};

/** Checks what the owner typed, with a clear Arabic message for each mistake. */
function validate(input: ItemInput, currencies: Currencies): { ok: true; value: Clean } | { ok: false; error: string } {
  const name = input.name.trim();
  if (Array.from(name).length < 1 || Array.from(name).length > NAME_MAX || !hasLetterOrDigit(name)) {
    return { ok: false, error: `اسم المنتج مطلوب (حتى ${NAME_MAX} حرفًا، ويحتوي على حرف أو رقم)` };
  }
  const description = input.description.trim();
  if (Array.from(description).length > DESCRIPTION_MAX) {
    return { ok: false, error: `الوصف طويل جدًا (حتى ${DESCRIPTION_MAX} حرفًا)` };
  }
  const needUsd = currencies === 'USD' || currencies === 'BOTH';
  const needLbp = currencies === 'LBP' || currencies === 'BOTH';

  // One pair of prices: only the currencies the restaurant uses are kept, and each of them is required.
  const prices = (usdText: string, lbpText: string, who: string) => {
    const usd = parseUsd(usdText);
    if (!usd.ok) return { ok: false as const, error: usd.error };
    const lbp = parseLbp(lbpText);
    if (!lbp.ok) return { ok: false as const, error: lbp.error };
    if (needUsd && usd.value === null) return { ok: false as const, error: `${who}: أدخل السعر بالدولار` };
    if (needLbp && lbp.value === null) return { ok: false as const, error: `${who}: أدخل السعر بالليرة` };
    return { ok: true as const, usd: needUsd ? usd.value : null, lbp: needLbp ? lbp.value : null };
  };

  if (input.sizes.length === 0) {
    const p = prices(input.priceUsd, input.priceLbp, 'السعر');
    if (!p.ok) return p;
    return { ok: true, value: { name, description, usd: p.usd, lbp: p.lbp, labels: [], usds: [], lbps: [] } };
  }

  if (input.sizes.length < 2) return { ok: false, error: 'المنتج ذو الأحجام يحتاج حجمين على الأقل' };
  if (input.sizes.length > MAX_SIZES) return { ok: false, error: `الحد الأقصى ${MAX_SIZES} أحجام للمنتج` };
  const labels: string[] = [];
  const usds: (string | null)[] = [];
  const lbps: (string | null)[] = [];
  for (const size of input.sizes) {
    const label = size.label.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(label)) {
      return { ok: false, error: 'اسم الحجم يتكوّن من حتى 6 أحرف إنجليزية أو أرقام، مثل S أو M أو L أو XL' };
    }
    if (labels.includes(label)) return { ok: false, error: `الحجم ${label} مكرّر` };
    const p = prices(size.priceUsd, size.priceLbp, `الحجم ${label}`);
    if (!p.ok) return p;
    labels.push(label);
    usds.push(p.usd);
    lbps.push(p.lbp);
  }
  return { ok: true, value: { name, description, usd: null, lbp: null, labels, usds, lbps } };
}

// The same currency rule, repeated inside the SQL: if the restaurant changed its currency while the
// owner was typing, the save is refused instead of storing an item without a price.
const COMPLETE = (usd: string, lbp: string, labels: string) => `
  (NOT (SELECT nu FROM r) OR CASE WHEN cardinality(${labels}::text[]) > 0
     THEN NOT EXISTS (SELECT 1 FROM inp WHERE usd IS NULL) ELSE ${usd}::numeric IS NOT NULL END)
  AND (NOT (SELECT nl FROM r) OR CASE WHEN cardinality(${labels}::text[]) > 0
     THEN NOT EXISTS (SELECT 1 FROM inp WHERE lbp IS NULL) ELSE ${lbp}::numeric IS NOT NULL END)`;

const RESTAURANT = `r AS (
  SELECT id, currencies IN ('USD','BOTH') AS nu, currencies IN ('LBP','BOTH') AS nl
  FROM restaurants WHERE owner_id = $1 AND status = 'active')`;

/** A write changed nothing: find out why and say it. */
async function diagnose(db: Db, ownerId: string, categoryId: string, itemId: string | null): Promise<Result> {
  const res = await db.query(
    `SELECT EXISTS (SELECT 1 FROM categories WHERE id = $2::uuid AND restaurant_id = ${MY_RESTAURANT}) AS category_ok,
            EXISTS (SELECT 1 FROM items WHERE id = $3::uuid AND restaurant_id = ${MY_RESTAURANT}) AS item_ok,
            (SELECT count(*) FROM items WHERE restaurant_id = ${MY_RESTAURANT})::int AS total`,
    [ownerId, categoryId, itemId],
  );
  const d = res.rows[0];
  let answer: Result = fail(409, 'تغيّرت إعدادات المطعم أثناء الحفظ. راجع الأسعار وحاول مرة أخرى.');
  if (itemId && !d.item_ok) answer = fail(404, 'المنتج غير موجود');
  else if (!d.category_ok) answer = fail(404, 'القسم غير موجود');
  else if (!itemId && d.total >= MAX_ITEMS) answer = fail(409, `لا يمكن إضافة المزيد (الحد الأقصى ${MAX_ITEMS} منتج)`);
  return explain(db, ownerId, answer); // a suspended restaurant always gets the suspension answer
}

export async function createItem(db: Db, ownerId: string, input: ItemInput): Promise<Result> {
  const restaurant = await getOwnerRestaurant(db, ownerId);
  if (!restaurant) return fail(404, 'المطعم غير موجود');
  const clean = validate(input, restaurant.currencies);
  if (!clean.ok) return explain(db, ownerId, fail(400, clean.error));
  const v = clean.value;
  const res = await db.query(
    `WITH ${RESTAURANT},
     cat AS (SELECT id FROM categories WHERE id = $2::uuid AND restaurant_id = (SELECT id FROM r)),
     inp AS (SELECT t.label, t.usd, t.lbp, t.ord FROM unnest($8::text[], $9::numeric[], $10::numeric[]) WITH ORDINALITY AS t(label, usd, lbp, ord)),
     newitem AS (
       INSERT INTO items (restaurant_id, category_id, name, description, available, price_usd, price_lbp, sort_order)
       SELECT r.id, cat.id, $3, $4, $5::boolean, $6::numeric, $7::numeric,
              COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE category_id = cat.id), 0)
       FROM r, cat
       WHERE (SELECT count(*) FROM items WHERE restaurant_id = r.id) < $11
         AND ${COMPLETE('$6', '$7', '$8')}
       RETURNING id, restaurant_id
     ),
     sz AS (
       INSERT INTO item_sizes (restaurant_id, item_id, label, price_usd, price_lbp, sort_order)
       SELECT newitem.restaurant_id, newitem.id, inp.label, inp.usd, inp.lbp, (inp.ord - 1)::int FROM newitem, inp
       RETURNING id
     )
     SELECT (SELECT id FROM newitem) AS id`,
    [ownerId, input.categoryId, v.name, v.description, input.available, v.usd, v.lbp, v.labels, v.usds, v.lbps, MAX_ITEMS],
  );
  return res.rows[0]?.id ? { ok: true } : diagnose(db, ownerId, input.categoryId, null);
}

export async function updateItem(db: Db, ownerId: string, itemId: string, input: ItemInput): Promise<Result> {
  const restaurant = await getOwnerRestaurant(db, ownerId);
  if (!restaurant) return fail(404, 'المطعم غير موجود');
  const clean = validate(input, restaurant.currencies);
  if (!clean.ok) return explain(db, ownerId, fail(400, clean.error));
  const v = clean.value;
  // Prices of a currency the restaurant does not use now are kept as they are (just hidden), so
  // going back to the other currency later loses nothing. Sizes removed from the form are deleted.
  const res = await db.query(
    `WITH ${RESTAURANT},
     it AS (SELECT id FROM items WHERE id = $2::uuid AND restaurant_id = (SELECT id FROM r)),
     cat AS (SELECT id FROM categories WHERE id = $3::uuid AND restaurant_id = (SELECT id FROM r)),
     inp AS (SELECT t.label, t.usd, t.lbp, t.ord FROM unnest($9::text[], $10::numeric[], $11::numeric[]) WITH ORDINALITY AS t(label, usd, lbp, ord)),
     upd AS (
       UPDATE items SET
         category_id = (SELECT id FROM cat), name = $4, description = $5, available = $6::boolean,
         price_usd = CASE WHEN cardinality($9::text[]) > 0 THEN NULL WHEN (SELECT nu FROM r) THEN $7::numeric ELSE price_usd END,
         price_lbp = CASE WHEN cardinality($9::text[]) > 0 THEN NULL WHEN (SELECT nl FROM r) THEN $8::numeric ELSE price_lbp END,
         sort_order = CASE WHEN category_id = (SELECT id FROM cat) THEN sort_order
                           ELSE COALESCE((SELECT MAX(sort_order) + 1 FROM items WHERE category_id = (SELECT id FROM cat)), 0) END
       WHERE id = (SELECT id FROM it) AND EXISTS (SELECT 1 FROM cat)
         AND ${COMPLETE('$7', '$8', '$9')}
       RETURNING id, restaurant_id
     ),
     removed AS (
       DELETE FROM item_sizes WHERE item_id IN (SELECT id FROM upd) AND label <> ALL($9::text[]) RETURNING id
     ),
     kept AS (
       INSERT INTO item_sizes (restaurant_id, item_id, label, price_usd, price_lbp, sort_order)
       SELECT upd.restaurant_id, upd.id, inp.label, inp.usd, inp.lbp, (inp.ord - 1)::int FROM upd, inp
       ON CONFLICT (item_id, label) DO UPDATE SET
         price_usd = CASE WHEN (SELECT nu FROM r) THEN EXCLUDED.price_usd ELSE item_sizes.price_usd END,
         price_lbp = CASE WHEN (SELECT nl FROM r) THEN EXCLUDED.price_lbp ELSE item_sizes.price_lbp END,
         sort_order = EXCLUDED.sort_order
       RETURNING id
     )
     SELECT (SELECT id FROM upd) AS id`,
    [ownerId, itemId, input.categoryId, v.name, v.description, input.available, v.usd, v.lbp, v.labels, v.usds, v.lbps],
  );
  return res.rows[0]?.id ? { ok: true } : diagnose(db, ownerId, input.categoryId, itemId);
}

export async function setItemAvailable(db: Db, ownerId: string, id: string, available: boolean): Promise<Result> {
  const res = await db.query(
    `UPDATE items SET available = $3::boolean WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT} RETURNING id`,
    [ownerId, id, available],
  );
  return res.rows.length > 0 ? { ok: true } : explain(db, ownerId, fail(404, 'المنتج غير موجود'));
}

/** Deletes the item; its sizes go with it (the database cascades). */
export async function deleteItem(db: Db, ownerId: string, id: string): Promise<Result> {
  const res = await db.query(
    `DELETE FROM items WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT} RETURNING id`,
    [ownerId, id],
  );
  return res.rows.length > 0 ? { ok: true } : explain(db, ownerId, fail(404, 'المنتج غير موجود'));
}

/** Moves an item one place up or down inside its category (same renumbering idea as for categories). */
export async function moveItem(db: Db, ownerId: string, id: string, direction: 'up' | 'down'): Promise<Result> {
  const res = await db.query(
    `WITH mine AS (SELECT category_id FROM items WHERE id = $2 AND restaurant_id = ${MY_ACTIVE_RESTAURANT}),
     ranked AS (
       SELECT id, row_number() OVER (ORDER BY sort_order, id) AS pos
       FROM items WHERE category_id = (SELECT category_id FROM mine) AND restaurant_id = ${MY_ACTIVE_RESTAURANT}
     ),
     me AS (SELECT pos FROM ranked WHERE id = $2),
     target AS (SELECT (SELECT pos FROM me) + CASE WHEN $3::text = 'up' THEN -1 ELSE 1 END AS pos)
     UPDATE items i
     SET sort_order = CASE WHEN r.pos = (SELECT pos FROM me) THEN (SELECT pos FROM target)
                           WHEN r.pos = (SELECT pos FROM target) THEN (SELECT pos FROM me)
                           ELSE r.pos END
     FROM ranked r
     WHERE i.id = r.id AND i.restaurant_id = ${MY_ACTIVE_RESTAURANT}
       AND EXISTS (SELECT 1 FROM me)
       AND (SELECT pos FROM target) BETWEEN 1 AND (SELECT count(*) FROM ranked)
     RETURNING i.id`,
    [ownerId, id, direction],
  );
  if (res.rows.length > 0) return { ok: true };
  const exists = await db.query(`SELECT 1 FROM items WHERE id = $2 AND restaurant_id = ${MY_RESTAURANT}`, [ownerId, id]);
  return explain(db, ownerId, exists.rows.length === 0 ? fail(404, 'المنتج غير موجود') : { ok: true });
}

export type ItemRow = {
  id: string; category_id: string; name: string; description: string; available: boolean;
  price_usd: string | null; price_lbp: string | null;
  sizes: { label: string; price_usd: string | null; price_lbp: string | null }[];
};

/** All items of the owner's restaurant with their sizes: one query. Prices come back as exact text. */
export async function listItems(db: Db, ownerId: string): Promise<ItemRow[]> {
  const res = await db.query(
    `SELECT i.id, i.category_id, i.name, i.description, i.available,
            i.price_usd::text AS price_usd, i.price_lbp::text AS price_lbp,
            COALESCE((SELECT json_agg(json_build_object('label', s.label, 'price_usd', s.price_usd::text, 'price_lbp', s.price_lbp::text)
                                      ORDER BY s.sort_order, s.label)
                      FROM item_sizes s WHERE s.item_id = i.id), '[]'::json) AS sizes
     FROM items i JOIN categories c ON c.id = i.category_id AND c.restaurant_id = i.restaurant_id
     WHERE i.restaurant_id = ${MY_RESTAURANT}
     ORDER BY c.sort_order, c.id, i.sort_order, i.id`,
    [ownerId],
  );
  return res.rows;
}
