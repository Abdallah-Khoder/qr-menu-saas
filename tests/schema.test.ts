import { describe, it, expect, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, add, count, slug } from './helpers';

let pg: PGlite;
beforeEach(async () => {
  pg = await makeDb();
});

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('ids', () => {
  it('are random UUIDs, not 1, 2, 3', async () => {
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    expect(a.restaurantId).toMatch(uuidRegex);
    expect(a.ownerId).toMatch(uuidRegex);
    expect(a.restaurantId).not.toBe(b.restaurantId);
  });
});

describe('restaurants', () => {
  it('rejects a duplicate public_slug', async () => {
    await add.tenant(pg, 'shaarcrepe');
    const other = await add.owner(pg, 'other@example.com');
    await expect(add.restaurant(pg, other, slug('shaarcrepe'))).rejects.toThrow();
  });

  it('accepts a readable name + 10 random characters', async () => {
    const owner = await add.owner(pg, 'o@example.com');
    await add.restaurant(pg, owner, 'shaar-crepe-k3x9qp7vtz');
  });

  it('rejects slugs with a bad shape', async () => {
    const bad = [
      'shaarcrepe-short',            // random part is not 10 characters
      'shaarcrepe-K3X9QP7VTZ',       // uppercase
      'shaarcrepe-k3x9qp7vtz!',      // symbol
      'k3x9qp7vtz',                  // no readable name part
      'has space-k3x9qp7vtz',        // space
      '../../etc-k3x9qp7vtz',        // path tricks
      `${'a'.repeat(60)}-k3x9qp7vtz`, // too long
    ];
    for (const [i, s] of bad.entries()) {
      const owner = await add.owner(pg, `bad${i}@example.com`);
      await expect(add.restaurant(pg, owner, s), s).rejects.toThrow();
    }
  });

  it('allows only ONE restaurant per account', async () => {
    const owner = await add.owner(pg, 'o@example.com');
    await add.restaurant(pg, owner, slug('first'));
    await expect(add.restaurant(pg, owner, slug('second'))).rejects.toThrow();
  });

  it('needs an existing owner', async () => {
    await expect(
      add.restaurant(pg, '00000000-0000-4000-8000-000000000000', slug('ghost')),
    ).rejects.toThrow();
  });

  it('rejects unknown status and currencies, and blank names', async () => {
    const mk = async (n: string) => add.owner(pg, `${n}@example.com`);
    await expect(add.restaurant(pg, await mk('a'), slug('a'), { status: 'deleted' })).rejects.toThrow();
    await expect(add.restaurant(pg, await mk('b'), slug('b'), { currencies: 'EUR' })).rejects.toThrow();
    await expect(add.restaurant(pg, await mk('c'), slug('c'), { name: '   ' })).rejects.toThrow();
    for (const [i, currencies] of ['USD', 'LBP', 'BOTH'].entries()) {
      await add.restaurant(pg, await mk(`ok${i}`), slug(`ok${i}`), { currencies });
    }
  });

  it('phone_number: international format only (or empty)', async () => {
    const { restaurantId } = await add.tenant(pg, 'alpha');
    const set = (v: string | null) => pg.query(`UPDATE restaurants SET phone_number = $1 WHERE id = $2`, [v, restaurantId]);
    await set('+96176123456');
    await set(null);
    for (const bad of ['76123456', '+961 76 123 456', 'call me', '+0123456789', '+9617']) {
      await expect(set(bad), bad).rejects.toThrow();
    }
  });

  it('map_url: https only', async () => {
    const { restaurantId } = await add.tenant(pg, 'alpha');
    const set = (v: string) => pg.query(`UPDATE restaurants SET map_url = $1 WHERE id = $2`, [v, restaurantId]);
    await set('https://maps.example.com/x');
    await expect(set('javascript:alert(1)')).rejects.toThrow();
    await expect(set('http://maps.example.com/x')).rejects.toThrow();
  });
});

describe('users', () => {
  it('rejects the same email twice, and emails with uppercase letters', async () => {
    await add.owner(pg, 'a@example.com');
    await expect(add.owner(pg, 'a@example.com')).rejects.toThrow();
    await expect(add.owner(pg, 'B@Example.com')).rejects.toThrow();
  });

  it('rejects an unknown role and a missing password hash', async () => {
    await expect(pg.query(`INSERT INTO users (email, password_hash, role) VALUES ('x@example.com', 'h', 'admin')`)).rejects.toThrow();
    await expect(pg.query(`INSERT INTO users (email, role) VALUES ('y@example.com', 'super_admin')`)).rejects.toThrow();
  });
});

describe('invites and email codes', () => {
  it('stores each token hash only once', async () => {
    const admin = await add.superAdmin(pg);
    const insert = () =>
      pg.query(`INSERT INTO invites (token_hash, created_by, expires_at) VALUES ('same-hash', $1, now() + interval '7 days')`, [admin]);
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it('keeps the invite record when the user who used it is deleted (used_by becomes NULL)', async () => {
    const admin = await add.superAdmin(pg);
    const owner = await add.owner(pg, 'o@example.com');
    await pg.query(
      `INSERT INTO invites (token_hash, created_by, expires_at, used_at, used_by) VALUES ('h1', $1, now(), now(), $2)`,
      [admin, owner],
    );
    await pg.query('DELETE FROM users WHERE id = $1', [owner]);
    const rows = (await pg.query<{ used_by: string | null }>('SELECT used_by FROM invites')).rows;
    expect(rows).toEqual([{ used_by: null }]);
  });

  it('only accepts known purposes and non-negative attempts', async () => {
    const owner = await add.owner(pg, 'o@example.com');
    const insert = (purpose: string, attempts = 0) =>
      pg.query(
        `INSERT INTO email_codes (user_id, purpose, code_hash, expires_at, attempts) VALUES ($1, $2, 'h', now(), $3)`,
        [owner, purpose, attempts],
      );
    await insert('verify_email');
    await insert('reset_password');
    await expect(insert('anything_else')).rejects.toThrow();
    await expect(insert('verify_email', -1)).rejects.toThrow();
  });

  it('deleting a user deletes their email codes', async () => {
    const owner = await add.owner(pg, 'o@example.com');
    await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify_email', 'h', now())`, [owner]);
    await pg.query('DELETE FROM users WHERE id = $1', [owner]);
    expect(await count(pg, 'email_codes')).toBe(0);
  });
});

describe('menu data: the restaurant boundary', () => {
  it('REJECTS an item whose category belongs to another restaurant', async () => {
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    const categoryOfB = await add.category(pg, b.restaurantId);
    // restaurant A tries to attach an item to restaurant B's category
    await expect(add.item(pg, a.restaurantId, categoryOfB)).rejects.toThrow();
    expect(await count(pg, 'items')).toBe(0);
  });

  it('REJECTS a size whose item belongs to another restaurant', async () => {
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    const itemOfB = await add.item(pg, b.restaurantId, await add.category(pg, b.restaurantId));
    await expect(add.size(pg, a.restaurantId, itemOfB, 'S')).rejects.toThrow();
    expect(await count(pg, 'item_sizes')).toBe(0);
  });

  it('accepts a correct chain: restaurant, category, item, sizes', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, r, await add.category(pg, r), null);
    await add.size(pg, r, item, 'S', '3.00');
    await add.size(pg, r, item, 'M', '4.00');
    expect(await count(pg, 'item_sizes')).toBe(2);
  });

  it('accepts any language in names, even mixed', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const cat = await add.category(pg, r, 'برغر');
    await pg.query(`INSERT INTO items (restaurant_id, category_id, name) VALUES ($1, $2, 'Burger برغر')`, [r, cat]);
    const { rows } = await pg.query<{ name: string }>(`SELECT name FROM items`);
    expect(rows[0].name).toBe('Burger برغر');
  });

  it('rejects blank names and over-long descriptions', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    await expect(add.category(pg, r, '   ')).rejects.toThrow();
    const item = await add.item(pg, r, await add.category(pg, r));
    await expect(pg.query(`UPDATE items SET description = $1 WHERE id = $2`, ['x'.repeat(301), item])).rejects.toThrow();
    await pg.query(`UPDATE items SET description = $1 WHERE id = $2`, ['x'.repeat(300), item]);
  });

  it('rejects non-https images', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, r, await add.category(pg, r));
    await expect(pg.query(`UPDATE items SET image_url = 'http://insecure.example/a.jpg' WHERE id = $1`, [item])).rejects.toThrow();
    await expect(pg.query(`UPDATE items SET image_url = 'javascript:alert(1)' WHERE id = $1`, [item])).rejects.toThrow();
    await pg.query(`UPDATE items SET image_url = 'https://res.cloudinary.com/x/a.jpg' WHERE id = $1`, [item]);
  });
});

describe('prices', () => {
  it('are exact decimals: 0.10 + 0.20 is exactly 0.30 (a float would give 0.30000000000000004)', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const cat = await add.category(pg, r);
    await add.item(pg, r, cat, '0.10');
    await add.item(pg, r, cat, '0.20');
    const { rows } = await pg.query<{ total: string }>(`SELECT SUM(price_usd)::text AS total FROM items`);
    expect(rows[0].total).toBe('0.30');
  });

  it('keep two decimals, and hold big Lebanese pound amounts', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, r, await add.category(pg, r), '1.5');
    await pg.query(`UPDATE items SET price_lbp = 1500000 WHERE id = $1`, [item]);
    const { rows } = await pg.query<{ usd: string; lbp: string }>(`SELECT price_usd::text AS usd, price_lbp::text AS lbp FROM items`);
    expect(rows[0]).toEqual({ usd: '1.50', lbp: '1500000.00' });
  });

  it('are never negative, in either currency', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const cat = await add.category(pg, r);
    await expect(add.item(pg, r, cat, '-1')).rejects.toThrow();
    const item = await add.item(pg, r, cat);
    await expect(pg.query(`UPDATE items SET price_lbp = -5 WHERE id = $1`, [item])).rejects.toThrow();
    await expect(add.size(pg, r, item, 'L', '-5')).rejects.toThrow();
  });

  it('an item may have no price of its own (its sizes carry the prices)', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    await add.item(pg, r, await add.category(pg, r), null);
    expect(await count(pg, 'items')).toBe(1);
  });

  it('a size needs at least one price: dollars, pounds, or both', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, r, await add.category(pg, r), null);
    await expect(add.size(pg, r, item, 'S', null, null)).rejects.toThrow();
    await add.size(pg, r, item, 'M', '3.00', null);
    await add.size(pg, r, item, 'L', null, '450000');
    await add.size(pg, r, item, 'XL', '5.00', '600000');
    expect(await count(pg, 'item_sizes')).toBe(3);
  });
});

describe('size labels', () => {
  it('1 to 6 letters or digits, unique per item', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, r, await add.category(pg, r), null);
    await add.size(pg, r, item, 'XXL');
    await expect(add.size(pg, r, item, 'XXL')).rejects.toThrow(); // duplicate in same item
    await expect(add.size(pg, r, item, '')).rejects.toThrow();
    await expect(add.size(pg, r, item, 'TOOLONGLABEL')).rejects.toThrow();
    await expect(add.size(pg, r, item, 'S M')).rejects.toThrow();
    await expect(add.size(pg, r, item, 'صغير')).rejects.toThrow(); // English letters only, by design
    const other = await add.item(pg, r, await add.category(pg, r), null);
    await add.size(pg, r, other, 'XXL'); // the same label on ANOTHER item is fine
  });
});

describe('deleting', () => {
  it('deleting a RESTAURANT removes its menu but keeps the account (who can open a new one)', async () => {
    const a = await add.tenant(pg, 'alpha');
    const item = await add.item(pg, a.restaurantId, await add.category(pg, a.restaurantId), null);
    await add.size(pg, a.restaurantId, item, 'S');
    await add.size(pg, a.restaurantId, item, 'M');

    await pg.query('DELETE FROM restaurants WHERE id = $1', [a.restaurantId]);

    for (const table of ['restaurants', 'categories', 'items', 'item_sizes']) expect(await count(pg, table)).toBe(0);
    expect(await count(pg, 'users')).toBe(1); // the owner is still there
    await add.restaurant(pg, a.ownerId, slug('second-try')); // and can start again
    expect(await count(pg, 'restaurants')).toBe(1);
  });

  it('deleting an ACCOUNT removes its restaurant and everything in it, and nothing else', async () => {
    const admin = await add.superAdmin(pg);
    const a = await add.tenant(pg, 'alpha');
    const b = await add.tenant(pg, 'beta');
    for (const t of [a, b]) {
      const item = await add.item(pg, t.restaurantId, await add.category(pg, t.restaurantId), null);
      await add.size(pg, t.restaurantId, item, 'S');
      await add.size(pg, t.restaurantId, item, 'M');
    }
    await pg.query(`INSERT INTO invites (token_hash, created_by, expires_at) VALUES ('h', $1, now())`, [admin]);

    await pg.query('DELETE FROM users WHERE id = $1', [a.ownerId]);

    for (const table of ['categories', 'items', 'item_sizes']) {
      const { rows } = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table} WHERE restaurant_id = $1`, [a.restaurantId]);
      expect(rows[0].n, table).toBe(0);
    }
    // restaurant B and the super admin are untouched
    expect(await count(pg, 'restaurants')).toBe(1);
    expect(await count(pg, 'categories')).toBe(1);
    expect(await count(pg, 'items')).toBe(1);
    expect(await count(pg, 'item_sizes')).toBe(2);
    expect(await count(pg, 'invites')).toBe(1);
    expect(await count(pg, 'users')).toBe(2); // admin + owner B
  });

  it('deleting a category removes its items and their sizes', async () => {
    const { restaurantId: r } = await add.tenant(pg, 'alpha');
    const cat = await add.category(pg, r);
    const item = await add.item(pg, r, cat, null);
    await add.size(pg, r, item, 'S');
    await pg.query('DELETE FROM categories WHERE id = $1', [cat]);
    expect(await count(pg, 'items')).toBe(0);
    expect(await count(pg, 'item_sizes')).toBe(0);
  });
});
