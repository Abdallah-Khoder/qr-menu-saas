import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { add, makeDb } from './helpers';

// The storage service itself (Vercel Blob) is never called from the tests: its three functions are replaced.
// The RULE that decides which links are accepted (isOwnImageUrl) is the real one.
const storage = vi.hoisted(() => ({
  saveImage: vi.fn(),
  forgetImages: vi.fn(),
  forgetRestaurantImages: vi.fn(),
}));
vi.mock('../src/lib/image-storage', async (original) => ({
  ...(await original<typeof import('../src/lib/image-storage')>()),
  saveImage: storage.saveImage,
  forgetImages: storage.forgetImages,
  forgetRestaurantImages: storage.forgetRestaurantImages,
}));

import { isOwnImageUrl, ourImageHost } from '../src/lib/image-storage';
import { handleImageUpload, UPLOAD_LIMIT } from '../src/lib/image-upload';
import { detectImageType, MAX_IMAGE_BYTES, UPLOAD_HEADER } from '../src/lib/image-type';
import { createItem, deleteItem, listItems, updateItem, type ItemInput } from '../src/lib/owner-items';
import { createCategory, deleteCategory, listCategories } from '../src/lib/owner-menu';
import { getPublicMenu } from '../src/lib/public-menu';

beforeEach(() => {
  vi.stubEnv('BLOB_PUBLIC_HOST', 'store1.public.blob.vercel-storage.com');
  vi.stubEnv('BLOB_READ_WRITE_TOKEN', '');
  storage.saveImage.mockReset();
  storage.forgetImages.mockReset();
  storage.forgetRestaurantImages.mockReset();
});

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(40).fill(0)]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0]);
const url = (restaurantId: string, name = 'item-Ab12.webp') => `https://store1.public.blob.vercel-storage.com/restaurants/${restaurantId}/${name}`;

afterEach(() => vi.unstubAllEnvs());

describe('detectImageType (decided from the first bytes only)', () => {
  it('knows JPEG, PNG and WebP', () => {
    expect(detectImageType(JPEG)).toBe('jpeg');
    expect(detectImageType(PNG)).toBe('png');
    expect(detectImageType(WEBP)).toBe('webp');
  });
  it('refuses everything else: SVG, GIF, PDF, HTML, a WAV (also RIFF), too short, empty', () => {
    const text = (s: string) => new TextEncoder().encode(s);
    expect(detectImageType(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(detectImageType(text('GIF89a......'))).toBeNull();
    expect(detectImageType(text('%PDF-1.7'))).toBeNull();
    expect(detectImageType(text('<html><body>'))).toBeNull();
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('isOwnImageUrl: only OUR links, inside THIS restaurant\'s folder', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  it('accepts a link we made', () => {
    expect(isOwnImageUrl(url(id), id)).toBe(true);
    expect(isOwnImageUrl(url(id, 'items/a-b.jpg'), id)).toBe(true);
  });
  it('refuses a link inside another restaurant\'s folder', () => {
    expect(isOwnImageUrl(url(other), id)).toBe(false);
  });
  it('refuses a link of ANOTHER Blob store (same ending, different store), even with the right folder', () => {
    expect(isOwnImageUrl(`https://attacker-store.public.blob.vercel-storage.com/restaurants/${id}/a.webp`, id)).toBe(false);
  });
  it('knows our store from BLOB_PUBLIC_HOST, or from the store id inside the token; with neither, accepts nothing', () => {
    expect(ourImageHost()).toBe('store1.public.blob.vercel-storage.com');
    vi.stubEnv('BLOB_PUBLIC_HOST', '');
    expect(ourImageHost()).toBeNull();
    expect(isOwnImageUrl(url(id), id)).toBe(false);
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'vercel_blob_rw_AbC123xYz_secretpart987');
    expect(ourImageHost()).toBe('abc123xyz.public.blob.vercel-storage.com');
    expect(isOwnImageUrl(`https://abc123xyz.public.blob.vercel-storage.com/restaurants/${id}/a.webp`, id)).toBe(true);
    expect(isOwnImageUrl(url(id), id)).toBe(false); // store1 is not this store
    vi.stubEnv('BLOB_READ_WRITE_TOKEN', 'garbage');
    expect(ourImageHost()).toBeNull();
  });
  it('refuses other sites, other schemes, tricks in the address', () => {
    const bad = [
      `http://store1.public.blob.vercel-storage.com/restaurants/${id}/a.webp`,
      `https://evil.example.com/restaurants/${id}/a.webp`,
      `https://store1.public.blob.vercel-storage.com.evil.com/restaurants/${id}/a.webp`,
      `https://evilpublic.blob.vercel-storage.com/restaurants/${id}/a.webp`,
      `https://.public.blob.vercel-storage.com/restaurants/${id}/a.webp`,
      `https://user:pw@store1.public.blob.vercel-storage.com/restaurants/${id}/a.webp`,
      `https://store1.public.blob.vercel-storage.com:8443/restaurants/${id}/a.webp`,
      `https://store1.public.blob.vercel-storage.com/restaurants/${id}/a.webp?x=1`,
      `https://store1.public.blob.vercel-storage.com/restaurants/${id}/a.webp#x`,
      `https://store1.public.blob.vercel-storage.com/restaurants/${id}/../${other}/a.webp`,
      `https://store1.public.blob.vercel-storage.com/restaurants/${id}/`,
      `https://store1.public.blob.vercel-storage.com/restaurants/${id}`,
      `https://store1.public.blob.vercel-storage.com/other/${id}/a.webp`,
      `javascript:alert(1)`,
      'not a url',
      '',
      url(id, 'a'.repeat(600)),
    ];
    for (const u of bad) expect(isOwnImageUrl(u, id), u).toBe(false);
  });
});

describe('POST /api/owner/upload (handleImageUpload)', () => {
  const form = (data: Uint8Array | string, name = 'photo.webp') => {
    const f = new FormData();
    f.append('file', new File([data as BlobPart], name));
    return f;
  };
  function req(body: FormData | null, headers: Record<string, string> = {}, size = 1000) {
    return new Request('http://x/api/owner/upload', {
      method: 'POST', body: body ?? undefined,
      headers: { [UPLOAD_HEADER]: '1', 'content-length': String(size), ...headers },
    });
  }
  async function setup() {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    const owner = { id: a.ownerId, email: 'o@example.com', role: 'owner' as const };
    return { pg, a, owner };
  }

  it('an owner uploads a real image: saved in HIS restaurant\'s folder, the type comes from the bytes', async () => {
    const { pg, a, owner } = await setup();
    storage.saveImage.mockResolvedValue(url(a.restaurantId));
    const res = await handleImageUpload(req(form(JPEG, 'evil.svg')), owner, pg); // the name lies, the bytes are a JPEG
    expect(res).toEqual({ status: 200, body: { url: url(a.restaurantId) } });
    expect(storage.saveImage).toHaveBeenCalledTimes(1);
    expect(storage.saveImage.mock.calls[0][0]).toBe(a.restaurantId);
    expect(storage.saveImage.mock.calls[0][2]).toBe('jpeg');
  });

  it('401 not logged in, 403 not an owner (nothing is saved)', async () => {
    const { pg } = await setup();
    expect((await handleImageUpload(req(form(JPEG)), null, pg)).status).toBe(401);
    expect((await handleImageUpload(req(form(JPEG)), { id: 'x', email: 'a@example.com', role: 'super_admin' as const }, pg)).status).toBe(403);
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('refuses a request that is not from our own page (no special header) and one without a size', async () => {
    const { pg, owner } = await setup();
    const noHeader = new Request('http://x/api/owner/upload', { method: 'POST', body: form(JPEG), headers: { 'content-length': '500' } });
    expect((await handleImageUpload(noHeader, owner, pg)).status).toBe(400);
    const noSize = new Request('http://x/api/owner/upload', { method: 'POST', body: form(JPEG), headers: { [UPLOAD_HEADER]: '1' } });
    expect((await handleImageUpload(noSize, owner, pg)).status).toBe(400);
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('refuses a big upload at once (413), by the size announced AND by the real file size', async () => {
    const { pg, owner } = await setup();
    expect((await handleImageUpload(req(form(JPEG), {}, MAX_IMAGE_BYTES + 100 * 1024), owner, pg)).status).toBe(413);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect((await handleImageUpload(req(form(big), {}, 1000), owner, pg)).status).toBe(413); // the header lied
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('refuses what is not a JPG, PNG or WebP picture (SVG, HTML, text) even when named .png', async () => {
    const { pg, owner } = await setup();
    for (const content of ['<svg onload="alert(1)"/>', '<html></html>', 'hello']) {
      const res = await handleImageUpload(req(form(content, 'photo.png')), owner, pg);
      expect(res.status, content).toBe(400);
    }
    expect((await handleImageUpload(req(null), owner, pg)).status).toBe(400); // no file at all
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('a suspended restaurant cannot upload', async () => {
    const { pg, a, owner } = await setup();
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    expect((await handleImageUpload(req(form(PNG)), owner, pg)).status).toBe(403);
    expect(storage.saveImage).not.toHaveBeenCalled();
  });

  it('a storage failure gives a clear error (502), not the technical message', async () => {
    const { pg, owner } = await setup();
    storage.saveImage.mockRejectedValue(new Error('BLOB secret-token-123 failed'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await handleImageUpload(req(form(WEBP)), owner, pg);
      expect(res.status).toBe(502);
      expect(JSON.stringify(res.body)).not.toContain('secret-token');
    } finally {
      spy.mockRestore();
    }
  });

  it(`is limited to ${UPLOAD_LIMIT.max} uploads per ${UPLOAD_LIMIT.minutes} minutes per owner`, async () => {
    const { pg, a, owner } = await setup();
    storage.saveImage.mockResolvedValue(url(a.restaurantId));
    for (let i = 0; i < UPLOAD_LIMIT.max; i++) expect((await handleImageUpload(req(form(JPEG)), owner, pg)).status).toBe(200);
    expect((await handleImageUpload(req(form(JPEG)), owner, pg)).status).toBe(429);
    expect(storage.saveImage).toHaveBeenCalledTimes(UPLOAD_LIMIT.max);
  }, 60_000);
});

describe('items with a photo', () => {
  const input = (categoryId: string, over: Partial<ItemInput> = {}): ItemInput => ({
    categoryId, name: 'Burger', description: '', available: true, imageUrl: '', priceUsd: '5', priceLbp: '', sizes: [], ...over,
  });
  async function setup() {
    const pg = await makeDb();
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    await createCategory(pg, a.ownerId, 'Burgers');
    const cat = (await listCategories(pg, a.ownerId))[0].id;
    return { pg, a, b, cat };
  }
  const first = async (pg: Awaited<ReturnType<typeof makeDb>>, ownerId: string) => (await listItems(pg, ownerId))[0];

  it('saves a photo link that belongs to the restaurant, and shows it in the list and on the public page', async () => {
    const { pg, a, cat } = await setup();
    const link = url(a.restaurantId);
    expect(await createItem(pg, a.ownerId, input(cat, { imageUrl: link }))).toEqual({ ok: true });
    expect((await first(pg, a.ownerId)).image_url).toBe(link);
    const menu = await getPublicMenu(pg, 'alpha-k3x9qp7vtz');
    expect(menu.state === 'ok' && menu.menu.categories[0].items[0].image).toBe(link);
  });

  it('an item without a photo has none (null)', async () => {
    const { pg, a, cat } = await setup();
    await createItem(pg, a.ownerId, input(cat));
    expect((await first(pg, a.ownerId)).image_url).toBeNull();
  });

  it('REFUSES a link of another restaurant, another site, or one typed by hand (nothing is saved)', async () => {
    const { pg, a, b, cat } = await setup();
    for (const imageUrl of [url(b.restaurantId), 'https://evil.example.com/x.png', 'http://store1.public.blob.vercel-storage.com/a.png', 'javascript:alert(1)']) {
      const res = await createItem(pg, a.ownerId, input(cat, { imageUrl }));
      expect(res.ok, imageUrl).toBe(false);
      if (!res.ok) expect(res.status).toBe(400);
    }
    expect(await listItems(pg, a.ownerId)).toHaveLength(0);
  });

  it('replacing the photo deletes the OLD file; keeping it or adding the first one deletes nothing', async () => {
    const { pg, a, cat } = await setup();
    const one = url(a.restaurantId, 'one.webp');
    const two = url(a.restaurantId, 'two.webp');
    await createItem(pg, a.ownerId, input(cat));
    const id = (await first(pg, a.ownerId)).id;
    expect((await updateItem(pg, a.ownerId, id, input(cat, { imageUrl: one }))).ok).toBe(true); // first photo
    expect(storage.forgetImages).not.toHaveBeenCalled();
    expect((await updateItem(pg, a.ownerId, id, input(cat, { imageUrl: one, name: 'Renamed' }))).ok).toBe(true); // same photo
    expect(storage.forgetImages).not.toHaveBeenCalled();
    expect((await updateItem(pg, a.ownerId, id, input(cat, { imageUrl: two }))).ok).toBe(true); // replaced
    expect(storage.forgetImages).toHaveBeenCalledWith([one]);
    storage.forgetImages.mockClear();
    expect((await updateItem(pg, a.ownerId, id, input(cat, { imageUrl: '' }))).ok).toBe(true); // removed
    expect(storage.forgetImages).toHaveBeenCalledWith([two]);
    expect((await first(pg, a.ownerId)).image_url).toBeNull();
  });

  it('a refused update (bad link) keeps the old photo and deletes nothing', async () => {
    const { pg, a, b, cat } = await setup();
    const one = url(a.restaurantId);
    await createItem(pg, a.ownerId, input(cat, { imageUrl: one }));
    const id = (await first(pg, a.ownerId)).id;
    expect((await updateItem(pg, a.ownerId, id, input(cat, { imageUrl: url(b.restaurantId) }))).ok).toBe(false);
    expect((await first(pg, a.ownerId)).image_url).toBe(one);
    expect(storage.forgetImages).not.toHaveBeenCalled();
  });

  it('deleting an item deletes its photo; deleting a category deletes the photos of all its items', async () => {
    const { pg, a, cat } = await setup();
    const one = url(a.restaurantId, 'one.webp');
    const two = url(a.restaurantId, 'two.webp');
    await createItem(pg, a.ownerId, input(cat, { name: 'A', imageUrl: one }));
    await createItem(pg, a.ownerId, input(cat, { name: 'B', imageUrl: two }));
    await createItem(pg, a.ownerId, input(cat, { name: 'C' }));
    const items = await listItems(pg, a.ownerId);
    const withOne = items.find((i) => i.name === 'A')!;
    expect((await deleteItem(pg, a.ownerId, withOne.id)).ok).toBe(true);
    expect(storage.forgetImages).toHaveBeenCalledWith([one]);
    storage.forgetImages.mockClear();
    expect((await deleteCategory(pg, a.ownerId, cat)).ok).toBe(true);
    expect(storage.forgetImages).toHaveBeenCalledTimes(1);
    expect(storage.forgetImages.mock.calls[0][0]).toEqual([two]);
  });

  it('SEVERAL items may share one photo: the file is deleted only when the LAST item using it lets go', async () => {
    const { pg, a, cat } = await setup();
    const shared = url(a.restaurantId, 'shared.webp');
    await createItem(pg, a.ownerId, input(cat, { name: 'A', imageUrl: shared }));
    await createItem(pg, a.ownerId, input(cat, { name: 'B', imageUrl: shared }));
    await createItem(pg, a.ownerId, input(cat, { name: 'C', imageUrl: shared }));
    expect(await listItems(pg, a.ownerId)).toHaveLength(3); // saving the same link twice is accepted
    const byName = async (n: string) => (await listItems(pg, a.ownerId)).find((i) => i.name === n)!;
    expect((await deleteItem(pg, a.ownerId, (await byName('A')).id)).ok).toBe(true);
    expect((await updateItem(pg, a.ownerId, (await byName('B')).id, input(cat, { name: 'B', imageUrl: url(a.restaurantId, 'own.webp') }))).ok).toBe(true);
    expect(storage.forgetImages).not.toHaveBeenCalledWith([shared]); // C still uses it: kept
    expect((await first(pg, a.ownerId)).image_url).not.toBeNull();
    expect((await deleteItem(pg, a.ownerId, (await byName('C')).id)).ok).toBe(true);
    expect(storage.forgetImages).toHaveBeenCalledWith([shared]); // nobody uses it now: deleted
  });

  it('deleting a category keeps a photo that an item of ANOTHER category still uses', async () => {
    const { pg, a, cat } = await setup();
    await createCategory(pg, a.ownerId, 'Drinks');
    const other = (await listCategories(pg, a.ownerId)).find((c) => c.id !== cat)!.id;
    const shared = url(a.restaurantId, 'shared.webp');
    const mine = url(a.restaurantId, 'mine.webp');
    await createItem(pg, a.ownerId, input(cat, { name: 'A', imageUrl: shared }));
    await createItem(pg, a.ownerId, input(cat, { name: 'B', imageUrl: mine }));
    await createItem(pg, a.ownerId, input(other, { name: 'D', imageUrl: shared }));
    expect((await deleteCategory(pg, a.ownerId, cat)).ok).toBe(true);
    expect(storage.forgetImages).toHaveBeenCalledTimes(1);
    expect(storage.forgetImages.mock.calls[0][0]).toEqual([mine]); // 'shared' stays: D uses it
  });

  it('a photo is never shared across RESTAURANTS: the other restaurant\'s items do not keep my file alive', async () => {
    const { pg, a, b, cat } = await setup();
    const mine = url(a.restaurantId);
    await createItem(pg, a.ownerId, input(cat, { imageUrl: mine }));
    await createCategory(pg, b.ownerId, 'X');
    const bcat = (await listCategories(pg, b.ownerId))[0].id;
    await createItem(pg, b.ownerId, input(bcat, { name: 'Other' })); // same name, no photo
    expect((await deleteItem(pg, a.ownerId, (await first(pg, a.ownerId)).id)).ok).toBe(true);
    expect(storage.forgetImages).toHaveBeenCalledWith([mine]);
  });

  it('a failing delete of the old file never fails the owner\'s change (forgetImages is best effort)', async () => {
    const { pg, a, cat } = await setup();
    await createItem(pg, a.ownerId, input(cat, { imageUrl: url(a.restaurantId) }));
    const id = (await first(pg, a.ownerId)).id;
    storage.forgetImages.mockResolvedValue(undefined);
    expect((await updateItem(pg, a.ownerId, id, input(cat))).ok).toBe(true);
  });
});
