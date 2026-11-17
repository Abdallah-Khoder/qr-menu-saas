import { describe, expect, it } from 'vitest';
import { add, makeDb } from './helpers';
import { qrPng, qrSvg } from '../src/lib/qr';
import { qrDownload } from '../src/lib/qr-download';

const BASE = 'https://menu.example.com';

async function setup() {
  const pg = await makeDb();
  const a = await add.tenant(pg, 'alpha');
  const b = await add.tenant(pg, 'beta');
  const admin = await add.superAdmin(pg);
  const owner = (id: string) => ({ id, email: 'x@example.com', role: 'owner' as const });
  return { pg, a, b, admin, owner };
}

describe('qrDownload', () => {
  it('gives the owner the SVG of HIS menu link, as a download', async () => {
    const { pg, a, owner } = await setup();
    const res = await qrDownload(pg, owner(a.ownerId), 'svg', BASE);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="menu-qr.svg"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await res.text()).toBe(await qrSvg(`${BASE}/m/alpha-k3x9qp7vtz`));
  });

  it('every owner gets his own code, never another restaurant\'s', async () => {
    const { pg, a, b, owner } = await setup();
    const mine = await (await qrDownload(pg, owner(a.ownerId), 'svg', BASE)).text();
    const theirs = await (await qrDownload(pg, owner(b.ownerId), 'svg', BASE)).text();
    expect(mine).not.toBe(theirs);
    expect(theirs).toBe(await qrSvg(`${BASE}/m/beta-k3x9qp7vtz`));
  });

  it('PNG is a real PNG picture of the same link', async () => {
    const { pg, a, owner } = await setup();
    const res = await qrDownload(pg, owner(a.ownerId), 'png', BASE);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="menu-qr.png"');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(Buffer.from(bytes).equals(await qrPng(`${BASE}/m/alpha-k3x9qp7vtz`))).toBe(true);
  });

  it('refuses: not logged in (401), not an owner (403), unknown format (400), owner without restaurant (404)', async () => {
    const { pg, a, admin, owner } = await setup();
    expect((await qrDownload(pg, null, 'svg', BASE)).status).toBe(401);
    expect((await qrDownload(pg, { id: admin, email: 'r@example.com', role: 'super_admin' }, 'svg', BASE)).status).toBe(403);
    for (const f of ['pdf', 'SVG', '', null, 'svg;png', '../x']) {
      expect((await qrDownload(pg, owner(a.ownerId), f, BASE)).status, String(f)).toBe(400);
    }
    const lonely = await add.owner(pg, 'lonely@example.com');
    expect((await qrDownload(pg, owner(lonely), 'svg', BASE)).status).toBe(404);
  });

  it('the answer never depends on anything but the logged-in user (no id can be sent)', async () => {
    const { pg, a, b, owner } = await setup();
    // the function has no place to put another restaurant's id: whatever the format text contains, it is only a format
    const res = await qrDownload(pg, owner(a.ownerId), `svg&restaurant=${b.restaurantId}`, BASE);
    expect(res.status).toBe(400);
  });

  it('a suspended restaurant can still download its code (the link then shows the "unavailable" page)', async () => {
    const { pg, a, owner } = await setup();
    await pg.query(`UPDATE restaurants SET status = 'suspended' WHERE id = $1`, [a.restaurantId]);
    expect((await qrDownload(pg, owner(a.ownerId), 'svg', BASE)).status).toBe(200);
  });
});

describe('qrPng', () => {
  it('is big enough to print sharply and always the same for the same link', async () => {
    const a = await qrPng('https://example.com/m/x-k3x9qp7vtz');
    expect(a.readUInt32BE(16)).toBeGreaterThanOrEqual(1000); // PNG width is stored at byte 16
    expect(a.equals(await qrPng('https://example.com/m/x-k3x9qp7vtz'))).toBe(true);
    expect(a.equals(await qrPng('https://example.com/m/y-k3x9qp7vtz'))).toBe(false);
  });
});
