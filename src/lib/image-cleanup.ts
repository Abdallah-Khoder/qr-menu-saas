import type { Db } from './db';
import { forgetImages } from './image-storage';

/**
 * Deletes photo files nobody needs any more. Several items MAY share one photo, so a file is deleted only when NO
 * item of this owner's restaurant still uses it (checked AFTER the change was saved, in one query).
 * Best effort like forgetImages: if even this check fails, nothing is deleted (a forgotten file only costs a little
 * space) and the owner's change, which is already saved, is never turned into an error.
 */
export async function forgetUnusedImages(db: Db, ownerId: string, urls: (string | null | undefined)[]): Promise<void> {
  const candidates = [...new Set(urls.filter((u): u is string => !!u))];
  if (candidates.length === 0) return;
  try {
    const used = await db.query(
      `SELECT DISTINCT i.image_url FROM items i JOIN restaurants r ON r.id = i.restaurant_id
       WHERE r.owner_id = $1 AND i.image_url = ANY($2::text[])`,
      [ownerId, candidates],
    );
    const stillUsed = new Set(used.rows.map((r) => r.image_url as string));
    await forgetImages(candidates.filter((u) => !stillUsed.has(u)));
  } catch (e) {
    console.error('could not check which photos are still used:', e instanceof Error ? e.message : e);
  }
}
