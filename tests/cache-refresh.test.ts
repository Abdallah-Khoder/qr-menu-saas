import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { add, makeDb } from './helpers';

// The cache itself belongs to Next; here we check the RULES: every change a customer could see
// throws away the cached menu of the right restaurant (and only that one), and bad links are not cached.
const mocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  unstable_cache: vi.fn(),
  user: { current: null as unknown },
  db: { current: null as unknown },
}));
vi.mock('next/cache', () => ({ revalidateTag: mocks.revalidateTag, unstable_cache: mocks.unstable_cache }));
vi.mock('../src/lib/current-user', () => ({ getCurrentUser: async () => mocks.user.current }));
vi.mock('../src/lib/db', () => ({ getDb: () => mocks.db.current }));
const storage = vi.hoisted(() => ({ forgetRestaurantImages: vi.fn(), forgetImages: vi.fn() }));
vi.mock('../src/lib/image-storage', async (original) => ({ ...(await original<typeof import('../src/lib/image-storage')>()), ...storage }));

import { POST as addCategory } from '../src/app/api/owner/categories/route';
import { POST as saveSettings } from '../src/app/api/owner/settings/route';
import { POST as deleteRestaurant } from '../src/app/api/admin/restaurants/[id]/delete/route';
import { POST as setStatus } from '../src/app/api/admin/restaurants/[id]/status/route';
import { getCachedPublicMenu, MENU_CACHE_SECONDS } from '../src/lib/public-cache';

const json = (body: unknown) => new Request('http://x/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const owner = (id: string) => ({ id, email: 'o@example.com', role: 'owner' });

async function setup() {
  const pg = await makeDb();
  mocks.db.current = pg;
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  const admin = await add.superAdmin(pg);
  return { pg, a, b, admin };
}

beforeEach(() => {
  mocks.revalidateTag.mockReset();
  mocks.unstable_cache.mockReset();
  mocks.user.current = null;
});

describe('owner changes refresh the cached public menu', () => {
  it('a successful change refreshes the menu of THAT owner\'s restaurant only, at once (expire 0)', async () => {
    const { a, b } = await setup();
    mocks.user.current = owner(a.ownerId);
    expect((await addCategory(json({ name: 'Drinks' }))).status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:alpha-k3x9qp7vtz', { expire: 0 });

    mocks.revalidateTag.mockReset();
    mocks.user.current = owner(b.ownerId);
    await addCategory(json({ name: 'Drinks' }));
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:beta-k3x9qp7vtz', { expire: 0 });
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1);
  });

  it('settings changes (name, phone, links, currencies) refresh it too', async () => {
    const { a } = await setup();
    mocks.user.current = owner(a.ownerId);
    const res = await saveSettings(json({ name: 'New name', currencies: 'USD', phone: '', mapUrl: '', instagram: '', facebook: '' }));
    expect(res.status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:alpha-k3x9qp7vtz', { expire: 0 });
  });

  it('if the link of the restaurant cannot be read, NOTHING is saved (never "error" for a change that was saved)', async () => {
    const { pg, a } = await setup();
    mocks.user.current = owner(a.ownerId);
    const real = pg.query.bind(pg);
    mocks.db.current = { query: async (text: string, params?: unknown[]) => { if (text.includes('SELECT public_slug')) throw new Error('db hiccup'); return real(text, params as never); } };
    await expect(addCategory(json({ name: 'Drinks' }))).rejects.toThrow('db hiccup');
    expect((await pg.query(`SELECT 1 FROM categories WHERE name = 'Drinks'`)).rows).toHaveLength(0);
  });

  it('if the refresh itself fails AFTER the save, the answer stays "ok" (the change is saved)', async () => {
    const { pg, a } = await setup();
    mocks.user.current = owner(a.ownerId);
    mocks.revalidateTag.mockImplementation(() => { throw new Error('cache down'); });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect((await addCategory(json({ name: 'Drinks' }))).status).toBe(200);
    } finally {
      spy.mockRestore();
    }
    expect((await pg.query(`SELECT 1 FROM categories WHERE name = 'Drinks'`)).rows).toHaveLength(1);
  });

  it('a refused or failed change refreshes nothing (nothing changed)', async () => {
    const { a } = await setup();
    mocks.user.current = owner(a.ownerId);
    expect((await addCategory(json({ name: '' }))).status).toBe(400);
    expect((await saveSettings(json({ name: '🍕', currencies: 'USD', phone: '', mapUrl: '', instagram: '', facebook: '' }))).status).toBe(400);
    mocks.user.current = null;
    expect((await addCategory(json({ name: 'x' }))).status).toBe(401);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('EVERY owner endpoint goes through ownerRoute (the one place that refreshes), except the QR download and the photo upload', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'route.ts') files.push(full);
      }
    };
    walk('src/app/api/owner');
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      if (file.includes(`${join('owner', 'qr')}`)) continue; // read-only download: changes nothing
      if (file.includes(`${join('owner', 'upload')}`)) continue; // a photo upload: shows on the menu only when the item is saved
      expect(readFileSync(file, 'utf8'), file).toContain('ownerRoute(');
    }
  });
});

describe('admin actions refresh the cached public menu', () => {
  it('suspending and activating', async () => {
    const { a, admin } = await setup();
    mocks.user.current = { id: admin, email: 'r@example.com', role: 'super_admin' };
    expect((await setStatus(json({ status: 'suspended' }), ctx(a.restaurantId))).status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:alpha-k3x9qp7vtz', { expire: 0 });
    mocks.revalidateTag.mockReset();
    expect((await setStatus(json({ status: 'active' }), ctx(a.restaurantId))).status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:alpha-k3x9qp7vtz', { expire: 0 });
  });

  it('deleting a restaurant (with its account) refreshes its link, which is read BEFORE the row disappears', async () => {
    const { a, b, admin } = await setup();
    mocks.user.current = { id: admin, email: 'r@example.com', role: 'super_admin' };
    expect((await deleteRestaurant(json({ withAccount: true }), ctx(a.restaurantId))).status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:alpha-k3x9qp7vtz', { expire: 0 });
    mocks.revalidateTag.mockReset();
    expect((await deleteRestaurant(json({ withAccount: true }), ctx(b.restaurantId))).status).toBe(200);
    expect(mocks.revalidateTag).toHaveBeenCalledWith('menu:beta-k3x9qp7vtz', { expire: 0 });
    // the photos of a deleted restaurant are deleted too (their folder, by the restaurant's id)
    expect(storage.forgetRestaurantImages.mock.calls.map((c) => c[0])).toEqual([a.restaurantId, b.restaurantId]);
  });

  it('the removed "restaurant only" request (an old open admin page) is refused and deletes nothing', async () => {
    const { a, admin, pg } = await setup();
    mocks.user.current = { id: admin, email: 'r@example.com', role: 'super_admin' };
    expect((await deleteRestaurant(json({ withAccount: false }), ctx(a.restaurantId))).status).toBe(400);
    expect((await deleteRestaurant(json({}), ctx(a.restaurantId))).status).toBe(400);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
    expect(storage.forgetRestaurantImages).not.toHaveBeenCalled();
    expect((await pg.query(`SELECT 1 FROM restaurants WHERE id = $1`, [a.restaurantId])).rows).toHaveLength(1);
  });

  it('an unknown restaurant, or a non-admin, refreshes nothing', async () => {
    const { a, admin } = await setup();
    mocks.user.current = { id: admin, email: 'r@example.com', role: 'super_admin' };
    expect((await setStatus(json({ status: 'suspended' }), ctx('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    mocks.user.current = owner(a.ownerId);
    expect((await setStatus(json({ status: 'suspended' }), ctx(a.restaurantId))).status).toBe(403);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});

describe('getCachedPublicMenu', () => {
  // stands in for Next's cache: just runs the function (and lets us look at how it was asked to cache)
  const passThrough = () => mocks.unstable_cache.mockImplementation((fn: () => Promise<unknown>) => () => fn());

  it('caches per link, tagged with that link, with a 5 minute safety net', async () => {
    const { a } = await setup();
    passThrough();
    const result = await getCachedPublicMenu('alpha-k3x9qp7vtz');
    expect(result.state).toBe('ok');
    const [, keyParts, options] = mocks.unstable_cache.mock.calls[0];
    expect(keyParts).toEqual(['public-menu', 'alpha-k3x9qp7vtz']);
    expect(options).toEqual({ tags: ['menu:alpha-k3x9qp7vtz'], revalidate: MENU_CACHE_SECONDS });
    expect(MENU_CACHE_SECONDS).toBe(300);
    expect(a.restaurantId).toBeTruthy();
  });

  it('an unknown link is answered "missing" and the cache function turns it into an ERROR so nothing is stored', async () => {
    await setup();
    let stored = 0;
    mocks.unstable_cache.mockImplementation((fn: () => Promise<unknown>) => async () => { const v = await fn(); stored++; return v; });
    expect(await getCachedPublicMenu('nobody-k3x9qp7vtz')).toEqual({ state: 'missing' });
    expect(stored).toBe(0); // the cached function threw before it could return a value
  });

  it('a link of a bad shape never reaches the cache or the database', async () => {
    await setup();
    for (const slug of ['ALPHA', '', "x'--", 'a'.repeat(61)]) expect(await getCachedPublicMenu(slug)).toEqual({ state: 'missing' });
    expect(mocks.unstable_cache).not.toHaveBeenCalled();
  });

  it('a real database failure is not hidden as "missing"', async () => {
    mocks.db.current = { query: async () => { throw new Error('database down'); } };
    passThrough();
    await expect(getCachedPublicMenu('alpha-k3x9qp7vtz')).rejects.toThrow('database down');
  });

  it('a suspended restaurant is cached as "unavailable" (and refreshed the moment the admin changes it)', async () => {
    const { pg, a } = await setup();
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    passThrough();
    expect(await getCachedPublicMenu('alpha-k3x9qp7vtz')).toEqual({ state: 'unavailable' });
  });
});
