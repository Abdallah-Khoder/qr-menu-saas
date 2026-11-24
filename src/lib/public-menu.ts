import type { Db } from './db';

// What a customer sees after scanning the QR code. ONE query, no login, nothing secret:
// only the restaurant found by its public link, only available items, no empty categories,
// and a suspended restaurant gives no items at all.

export type PublicSize = { label: string; price_usd: string | null; price_lbp: string | null };
export type PublicItem = {
  name: string; description: string; image: string | null; price_usd: string | null; price_lbp: string | null; sizes: PublicSize[];
};
export type PublicLocation = { name: string; url: string };
export type PublicCategory = { name: string; items: PublicItem[] };
export type PublicMenu = {
  name: string; currencies: 'USD' | 'LBP' | 'BOTH';
  phone: string | null; instagram: string | null; facebook: string | null; tiktok: string | null;
  locations: PublicLocation[]; // the branches, each with its map link (the owner's order)
  direction: 'rtl' | 'ltr'; // which way the page reads (the owner's choice)
  categories: PublicCategory[];
};
export type PublicResult = { state: 'ok'; menu: PublicMenu } | { state: 'unavailable' } | { state: 'missing' };

/** A real public link looks like "shaar-crepe-k3x9qp7vtz": anything else is "not found" without asking the database. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,59}$/;

export async function getPublicMenu(db: Db, slug: string): Promise<PublicResult> {
  if (!SLUG_PATTERN.test(slug)) return { state: 'missing' };
  const res = await db.query(
    `SELECT r.status, r.name, r.currencies, r.phone_number, r.instagram_url, r.facebook_url, r.tiktok_url, r.menu_direction,
       CASE WHEN r.status = 'active' THEN COALESCE((
         SELECT json_agg(json_build_object('name', c.name, 'items', (
           SELECT json_agg(json_build_object(
             'name', i.name, 'description', i.description, 'image', i.image_url,
             'price_usd', i.price_usd::text, 'price_lbp', i.price_lbp::text,
             'sizes', COALESCE((SELECT json_agg(json_build_object('label', s.label, 'price_usd', s.price_usd::text, 'price_lbp', s.price_lbp::text)
                                ORDER BY s.sort_order, s.label)
                                FROM item_sizes s WHERE s.item_id = i.id AND s.restaurant_id = r.id), '[]'::json)
           ) ORDER BY i.sort_order, i.id)
           FROM items i WHERE i.category_id = c.id AND i.restaurant_id = r.id AND i.available
         )) ORDER BY c.sort_order, c.id)
         FROM categories c
         WHERE c.restaurant_id = r.id
           AND EXISTS (SELECT 1 FROM items i WHERE i.category_id = c.id AND i.restaurant_id = r.id AND i.available)
       ), '[]'::json) ELSE '[]'::json END AS categories,
       CASE WHEN r.status = 'active' THEN COALESCE((
         SELECT json_agg(json_build_object('name', l.name, 'url', l.map_url) ORDER BY l.sort_order, l.id)
         FROM restaurant_locations l WHERE l.restaurant_id = r.id
       ), '[]'::json) ELSE '[]'::json END AS locations
     FROM restaurants r WHERE r.public_slug = $1`,
    [slug],
  );
  const row = res.rows[0];
  if (!row) return { state: 'missing' };
  if (row.status !== 'active') return { state: 'unavailable' };
  return {
    state: 'ok',
    menu: {
      name: row.name, currencies: row.currencies, phone: row.phone_number, locations: row.locations,
      instagram: row.instagram_url, facebook: row.facebook_url, tiktok: row.tiktok_url, direction: row.menu_direction,
      categories: row.categories,
    },
  };
}

/** WhatsApp wants the number as digits only: "+96170123456" → "https://wa.me/96170123456". */
export const whatsappUrl = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;
