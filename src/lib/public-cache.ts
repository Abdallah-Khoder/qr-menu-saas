import { revalidateTag, unstable_cache } from 'next/cache';
import type { Db } from './db';
import { getDb } from './db';
import { SLUG_PATTERN, getPublicMenu, type PublicResult } from './public-menu';

// The public menu is read by many customers and changed by few owners, so it is kept in the cache and
// thrown away THE MOMENT someone changes it (one cache entry per restaurant, named by its public link).
//
//  * Every owner write goes through `ownerRoute`, which calls `refreshMenu` after a success.
//  * Every admin action that changes what customers see (suspend, activate, delete) calls `refreshMenu`.
//  * Safety net: even if a refresh were ever forgotten, an entry lives 5 minutes at most.

export const MENU_CACHE_SECONDS = 300;
export const menuTag = (slug: string) => `menu:${slug}`;

class NotCached extends Error {}

/**
 * The public menu, from the cache when it is there. An unknown link is never stored: otherwise anybody
 * could fill the cache with made-up links.
 */
export async function getCachedPublicMenu(slug: string): Promise<PublicResult> {
  if (!SLUG_PATTERN.test(slug)) return { state: 'missing' };
  const read = unstable_cache(
    async () => {
      const result = await getPublicMenu(getDb(), slug);
      if (result.state === 'missing') throw new NotCached(); // an error is not stored by the cache
      return result;
    },
    ['public-menu', slug],
    { tags: [menuTag(slug)], revalidate: MENU_CACHE_SECONDS },
  );
  try {
    return await read();
  } catch (error) {
    if (error instanceof NotCached) return { state: 'missing' };
    throw error;
  }
}

/** Throw away the cached menu of this public link: the next customer gets fresh data (never a stale copy). */
export function refreshMenu(slug: string | null | undefined) {
  if (slug) revalidateTag(menuTag(slug), { expire: 0 });
}

/**
 * The public link of an owner's restaurant. Asked BEFORE his change is saved: if this question fails we stop
 * before saving anything, so a saved change can never end up with an error answer and an old cached menu.
 */
export async function slugOfOwner(db: Db, ownerId: string): Promise<string | null> {
  const res = await db.query(`SELECT public_slug FROM restaurants WHERE owner_id = $1`, [ownerId]);
  return res.rows[0]?.public_slug ?? null;
}

/** The public link of a restaurant (admin side: asked BEFORE a delete, while the row still exists). */
export async function slugOfRestaurant(db: Db, restaurantId: string): Promise<string | null> {
  const res = await db.query(`SELECT public_slug FROM restaurants WHERE id = $1`, [restaurantId]);
  return res.rows[0]?.public_slug ?? null;
}
