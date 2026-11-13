import { describe, it, expect, beforeEach } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { makeDb, add, count } from './helpers';

let pg: PGlite;
beforeEach(async () => {
  pg = await makeDb();
});

describe('restaurants', () => {
  it('rejects a duplicate public_slug', async () => {
    await add.restaurant(pg, 'aaaaaaaaaaaa');
    await expect(add.restaurant(pg, 'aaaaaaaaaaaa')).rejects.toThrow();
  });

  it('rejects slugs that are too short or contain unsafe characters', async () => {
    await expect(add.restaurant(pg, 'short')).rejects.toThrow();
    await expect(add.restaurant(pg, 'has space in it!')).rejects.toThrow();
    await expect(add.restaurant(pg, '../../etc/passwd')).rejects.toThrow();
  });

  it('rejects unknown status and currency, and blank names', async () => {
    await expect(add.restaurant(pg, 'bbbbbbbbbbbb', { status: 'deleted' })).rejects.toThrow();
    await expect(add.restaurant(pg, 'cccccccccccc', { currency: 'EUR' })).rejects.toThrow();
    await expect(add.restaurant(pg, 'dddddddddddd', { name: '   ' })).rejects.toThrow();
  });

  it('only allows https map links and digit-only phones', async () => {
    const id = await add.restaurant(pg, 'eeeeeeeeeeee');
    await expect(pg.query(`UPDATE restaurants SET map_url = 'javascript:alert(1)' WHERE id = $1`, [id])).rejects.toThrow();
    await expect(pg.query(`UPDATE restaurants SET phone = 'call me' WHERE id = $1`, [id])).rejects.toThrow();
    await pg.query(`UPDATE restaurants SET map_url = 'https://maps.example.com/x', phone = '+961 76 123 456' WHERE id = $1`, [id]);
  });
});

describe('users', () => {
  it('rejects the same email twice, and emails with uppercase letters', async () => {
    const r1 = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const r2 = await add.restaurant(pg, 'bbbbbbbbbbbb');
    await add.owner(pg, 'a@example.com', r1);
    await expect(add.owner(pg, 'a@example.com', r2)).rejects.toThrow();
    await expect(add.owner(pg, 'B@Example.com', r2)).rejects.toThrow();
  });

  it('allows only ONE owner per restaurant', async () => {
    const r = await add.restaurant(pg, 'aaaaaaaaaaaa');
    await add.owner(pg, 'first@example.com', r);
    await expect(add.owner(pg, 'second@example.com', r)).rejects.toThrow();
  });

  it('an owner must have a restaurant, a super admin must not', async () => {
    await expect(
      pg.query(`INSERT INTO users (email, password_hash, role) VALUES ('o@example.com', 'h', 'owner')`),
    ).rejects.toThrow();
    const r = await add.restaurant(pg, 'aaaaaaaaaaaa');
    await expect(
      pg.query(`INSERT INTO users (email, password_hash, role, restaurant_id) VALUES ('s@example.com', 'h', 'super_admin', $1)`, [r]),
    ).rejects.toThrow();
    await add.superAdmin(pg); // valid
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
    const r = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const owner = await add.owner(pg, 'o@example.com', r);
    await pg.query(
      `INSERT INTO invites (token_hash, created_by, expires_at, used_at, used_by) VALUES ('h1', $1, now(), now(), $2)`,
      [admin, owner],
    );
    await pg.query('DELETE FROM restaurants WHERE id = $1', [r]); // cascades to the owner
    const rows = (await pg.query<{ used_by: number | null }>('SELECT used_by FROM invites')).rows;
    expect(rows).toEqual([{ used_by: null }]);
  });

  it('only accepts known purposes and non-negative attempts', async () => {
    const r = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const owner = await add.owner(pg, 'o@example.com', r);
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
    const r = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const owner = await add.owner(pg, 'o@example.com', r);
    await pg.query(`INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1, 'verify_email', 'h', now())`, [owner]);
    await pg.query('DELETE FROM users WHERE id = $1', [owner]);
    expect(await count(pg, 'email_codes')).toBe(0);
  });
});

describe('menu data: the restaurant boundary', () => {
  it('REJECTS an item whose category belongs to another restaurant', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const b = await add.restaurant(pg, 'bbbbbbbbbbbb');
    const categoryOfB = await add.category(pg, b);
    // restaurant A tries to attach an item to restaurant B's category
    await expect(add.item(pg, a, categoryOfB)).rejects.toThrow();
    expect(await count(pg, 'items')).toBe(0);
  });

  it('REJECTS a size whose item belongs to another restaurant', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const b = await add.restaurant(pg, 'bbbbbbbbbbbb');
    const itemOfB = await add.item(pg, b, await add.category(pg, b));
    await expect(add.size(pg, a, itemOfB, 'S')).rejects.toThrow();
    expect(await count(pg, 'item_sizes')).toBe(0);
  });

  it('accepts a correct chain: restaurant, category, item, sizes', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const item = await add.item(pg, a, await add.category(pg, a), null);
    await add.size(pg, a, item, 'S', 300);
    await add.size(pg, a, item, 'M', 400);
    expect(await count(pg, 'item_sizes')).toBe(2);
  });

  it('rejects negative prices and non-https images', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const cat = await add.category(pg, a);
    await expect(add.item(pg, a, cat, -1)).rejects.toThrow();
    const item = await add.item(pg, a, cat);
    await expect(add.size(pg, a, item, 'L', -5)).rejects.toThrow();
    await expect(pg.query(`UPDATE items SET image_url = 'http://insecure.example/a.jpg' WHERE id = $1`, [item])).rejects.toThrow();
    await expect(pg.query(`UPDATE items SET image_url = 'javascript:alert(1)' WHERE id = $1`, [item])).rejects.toThrow();
    await pg.query(`UPDATE items SET image_url = 'https://res.cloudinary.com/x/a.jpg' WHERE id = $1`, [item]);
  });

  it('size labels: 1 to 6 letters or digits, unique per item', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const item = await add.item(pg, a, await add.category(pg, a), null);
    await add.size(pg, a, item, 'XXL');
    await expect(add.size(pg, a, item, 'XXL')).rejects.toThrow(); // duplicate in same item
    await expect(add.size(pg, a, item, '')).rejects.toThrow();
    await expect(add.size(pg, a, item, 'TOOLONGLABEL')).rejects.toThrow();
    await expect(add.size(pg, a, item, 'S M')).rejects.toThrow();
    await expect(add.size(pg, a, item, 'صغير')).rejects.toThrow(); // English only, by design
    const other = await add.item(pg, a, await add.category(pg, a), null);
    await add.size(pg, a, other, 'XXL'); // the same label on ANOTHER item is fine
  });

  it('rejects blank names and over-long descriptions', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    await expect(add.category(pg, a, '   ')).rejects.toThrow();
    const cat = await add.category(pg, a);
    const item = await add.item(pg, a, cat);
    await expect(pg.query(`UPDATE items SET desc_ar = $1 WHERE id = $2`, ['x'.repeat(301), item])).rejects.toThrow();
  });
});

describe('deleting', () => {
  it('deleting a restaurant removes its owner, categories, items and sizes, and nothing else', async () => {
    const admin = await add.superAdmin(pg);
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const b = await add.restaurant(pg, 'bbbbbbbbbbbb');
    for (const [r, email] of [[a, 'a@example.com'], [b, 'b@example.com']] as const) {
      await add.owner(pg, email, r);
      const item = await add.item(pg, r, await add.category(pg, r), null);
      await add.size(pg, r, item, 'S');
      await add.size(pg, r, item, 'M');
    }
    await pg.query(`INSERT INTO invites (token_hash, created_by, expires_at) VALUES ('h', $1, now())`, [admin]);

    await pg.query('DELETE FROM restaurants WHERE id = $1', [a]);

    // restaurant A is gone, completely
    for (const table of ['categories', 'items', 'item_sizes']) {
      const { rows } = await pg.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ${table} WHERE restaurant_id = $1`, [a]);
      expect(rows[0].n).toBe(0);
    }
    const owners = (await pg.query<{ email: string }>(`SELECT email FROM users WHERE role = 'owner'`)).rows;
    expect(owners).toEqual([{ email: 'b@example.com' }]);
    // restaurant B and the super admin are untouched
    expect(await count(pg, 'categories')).toBe(1);
    expect(await count(pg, 'items')).toBe(1);
    expect(await count(pg, 'item_sizes')).toBe(2);
    expect(await count(pg, 'invites')).toBe(1);
    expect(await count(pg, 'users')).toBe(2);
  });

  it('deleting a category removes its items and their sizes', async () => {
    const a = await add.restaurant(pg, 'aaaaaaaaaaaa');
    const cat = await add.category(pg, a);
    const item = await add.item(pg, a, cat, null);
    await add.size(pg, a, item, 'S');
    await pg.query('DELETE FROM categories WHERE id = $1', [cat]);
    expect(await count(pg, 'items')).toBe(0);
    expect(await count(pg, 'item_sizes')).toBe(0);
  });
});
