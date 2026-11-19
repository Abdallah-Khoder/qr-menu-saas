import { del, list, put } from '@vercel/blob';
import { IMAGE_EXT, IMAGE_MIME, type ImageType } from './image-type';

// The ONLY file that knows where images are kept (Vercel Blob). To use another service later (Cloudflare R2,
// Supabase...) only this file changes: the rest of the app calls these four functions.
//
// Every image lives under  restaurants/<restaurant id>/  and a restaurant may only save links that point INTO
// its own folder (isOwnImageUrl). So an owner can never put a stranger's link, or another restaurant's image,
// on his menu: the database only ever holds links we made ourselves.

const HOST_SUFFIX = '.public.blob.vercel-storage.com';
export const IMAGE_URL_MAX = 500;

/**
 * The exact address of OUR store, e.g. abc123.public.blob.vercel-storage.com. Every Blob store has its own, and
 * all of them end the same way, so the ending alone would also accept somebody else's store.
 * It comes from BLOB_PUBLIC_HOST if you set it, otherwise from the store id inside BLOB_READ_WRITE_TOKEN
 * (vercel_blob_rw_<store id>_<secret>). If neither is there, no link is accepted (safe by default).
 */
export function ourImageHost(): string | null {
  const set = process.env.BLOB_PUBLIC_HOST?.trim().toLowerCase();
  if (set) return set;
  const id = /^vercel_blob_rw_([A-Za-z0-9]+)_/.exec(process.env.BLOB_READ_WRITE_TOKEN ?? '')?.[1];
  return id ? `${id.toLowerCase()}${HOST_SUFFIX}` : null;
}
const folderOf = (restaurantId: string) => `restaurants/${restaurantId}/`;

/** Saves one image and returns its public link. The file name is random: links cannot be guessed. */
export async function saveImage(restaurantId: string, bytes: Uint8Array, type: ImageType): Promise<string> {
  const blob = await put(`${folderOf(restaurantId)}item.${IMAGE_EXT[type]}`, Buffer.from(bytes), {
    access: 'public',
    addRandomSuffix: true,
    contentType: IMAGE_MIME[type], // decided by us from the bytes, not by the visitor
    cacheControlMaxAge: 60 * 60 * 24 * 30,
  });
  return blob.url;
}

/** Is this link one of OUR images, inside THIS restaurant's folder? (https, OUR store's address, nothing extra). */
export function isOwnImageUrl(value: string, restaurantId: string): boolean {
  const host = ourImageHost();
  if (!host || value.length > IMAGE_URL_MAX) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' && !url.username && !url.password && !url.port && !url.search && !url.hash &&
    url.hostname === host &&
    url.pathname.startsWith(`/${folderOf(restaurantId)}`) && url.pathname.length > folderOf(restaurantId).length + 1
  );
}

/**
 * Deletes images nobody needs any more (replaced, removed, item or category deleted). Best effort: if the
 * storage is down the change the owner made is still saved; an old file left behind costs a little space only.
 */
export async function forgetImages(urls: (string | null | undefined)[]): Promise<void> {
  const list = urls.filter((u): u is string => !!u);
  if (list.length === 0) return;
  try {
    await del(list);
  } catch (e) {
    console.error('could not delete images:', e instanceof Error ? e.message : e);
  }
}

/** Deletes the whole folder of a restaurant (when the administrator deletes it). Best effort, like forgetImages. */
export async function forgetRestaurantImages(restaurantId: string): Promise<void> {
  try {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: folderOf(restaurantId), cursor, limit: 500 });
      if (page.blobs.length > 0) await del(page.blobs.map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error('could not delete the restaurant images:', e instanceof Error ? e.message : e);
  }
}
