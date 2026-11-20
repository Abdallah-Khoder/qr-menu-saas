import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { add, makeDb } from './helpers';

// Here the REAL cleanup helpers run; only the storage service underneath fails, on purpose.
const blob = vi.hoisted(() => ({ del: vi.fn(), list: vi.fn(), put: vi.fn() }));
vi.mock('@vercel/blob', () => blob);

import { forgetImages, forgetRestaurantImages } from '../src/lib/image-storage';
import { createItem, listItems, updateItem } from '../src/lib/owner-items';
import { createCategory, listCategories } from '../src/lib/owner-menu';

beforeEach(() => {
  vi.stubEnv('BLOB_PUBLIC_HOST', 'store1.public.blob.vercel-storage.com');
  blob.del.mockReset();
  blob.list.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe('when the storage service is down, cleanup never breaks the owner\'s work', () => {
  it('forgetImages and forgetRestaurantImages swallow the error (and only log it)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      blob.del.mockRejectedValue(new Error('storage down'));
      blob.list.mockRejectedValue(new Error('storage down'));
      await expect(forgetImages(['https://store1.public.blob.vercel-storage.com/restaurants/x/a.webp'])).resolves.toBeUndefined();
      await expect(forgetRestaurantImages('x')).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it('replacing a photo while the old file cannot be deleted: the change is still saved ("ok")', async () => {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    await createCategory(pg, a.ownerId, 'Burgers');
    const cat = (await listCategories(pg, a.ownerId))[0].id;
    const link = (n: string) => `https://store1.public.blob.vercel-storage.com/restaurants/${a.restaurantId}/${n}.webp`;
    const input = (over = {}) => ({ categoryId: cat, name: 'Burger', description: '', available: true, imageUrl: link('one'), priceUsd: '5', priceLbp: '', sizes: [], ...over });
    expect(await createItem(pg, a.ownerId, input())).toEqual({ ok: true });
    const id = (await listItems(pg, a.ownerId))[0].id;
    blob.del.mockRejectedValue(new Error('storage down'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(await updateItem(pg, a.ownerId, id, input({ imageUrl: link('two'), name: 'New name' }))).toEqual({ ok: true });
    } finally {
      spy.mockRestore();
    }
    expect(blob.del).toHaveBeenCalledWith([link('one')]);
    const saved = (await listItems(pg, a.ownerId))[0];
    expect(saved.name).toBe('New name');
    expect(saved.image_url).toBe(link('two'));
  });
});
