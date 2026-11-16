import { describe, expect, test } from 'vitest';
import { makeDb, add } from './helpers';
import { makeSlug, slugify } from '../src/lib/slug';
import { hasLetterOrDigit } from '../src/lib/slugify';
import { qrSvg } from '../src/lib/qr';

describe('slugify', () => {
  test('English names become lowercase words joined by dashes', () => {
    expect(slugify('Shaar Crepe')).toBe('shaar-crepe');
    expect(slugify("  Joe's   Burger & Grill!! ")).toBe('joe-s-burger-grill');
  });

  test('Arabic letters are written with Latin letters, not translated', () => {
    expect(slugify('مطعم الشعار')).toBe('mtam-alshaar');
    expect(slugify('كريب')).toBe('kryb');
    expect(slugify('خبز غزة')).toBe('khbz-ghza');
  });

  test('hamza forms, ta marbuta and alef maqsura', () => {
    expect(slugify('أحمد')).toBe('ahmd');
    expect(slugify('مؤسسة')).toBe('mwssa');
    expect(slugify('مصطفى')).toBe('mstfa');
  });

  test('Arabic-Indic digits become normal digits', () => {
    expect(slugify('فرع ٢٤')).toBe('fra-24');
  });

  test('Arabic diacritics are removed', () => {
    expect(slugify('مَطْعَم')).toBe('mtam');
  });

  test('Latin accents are removed', () => {
    expect(slugify('Café Étoile')).toBe('cafe-etoile');
  });

  test('mixed languages work', () => {
    expect(slugify('مطعم Beirut 2')).toBe('mtam-beirut-2');
  });

  test('nothing usable falls back to "menu"', () => {
    expect(slugify('🍕🍔')).toBe('menu');
    expect(slugify('   ')).toBe('menu');
    expect(slugify('---')).toBe('menu');
  });

  test('long names are cut to 49 characters without a trailing dash', () => {
    const out = slugify('a'.repeat(48) + ' bbbbbbbbbb');
    expect(out.length).toBeLessThanOrEqual(49);
    expect(out.endsWith('-')).toBe(false);
    expect(slugify('ab '.repeat(40)).length).toBeLessThanOrEqual(49);
  });
});

describe('hasLetterOrDigit', () => {
  test('a name needs at least one letter or digit', () => {
    expect(hasLetterOrDigit('🍕🍔')).toBe(false);
    expect(hasLetterOrDigit('---  !!')).toBe(false);
    expect(hasLetterOrDigit('')).toBe(false);
    expect(hasLetterOrDigit('🍕 م')).toBe(true);
    expect(hasLetterOrDigit('٣')).toBe(true);
    expect(hasLetterOrDigit('A')).toBe(true);
  });
});

describe('qrSvg', () => {
  test('makes an SVG picture and never different for the same link', async () => {
    const svg = await qrSvg('https://example.com/m/shaar-crepe-k3x9qp7vtz');
    expect(svg).toContain('<svg');
    expect(await qrSvg('https://example.com/m/shaar-crepe-k3x9qp7vtz')).toBe(svg);
    expect(await qrSvg('https://example.com/m/other-k3x9qp7vtz')).not.toBe(svg);
  });
});

describe('makeSlug', () => {
  test('ends with 10 random characters and is different each time', () => {
    const a = makeSlug('Shaar Crepe');
    const b = makeSlug('Shaar Crepe');
    expect(a).toMatch(/^shaar-crepe-[a-z0-9]{10}$/);
    expect(a).not.toBe(b);
  });

  test('never longer than 60 characters', () => {
    expect(makeSlug('x'.repeat(500)).length).toBeLessThanOrEqual(60);
  });

  test('every kind of name is accepted by the database rule', async () => {
    const pg = await makeDb();
    const owner = await add.owner(pg, 'o@example.com');
    const names = ['Shaar Crepe', 'مطعم الشعار', '🍕', '', 'a'.repeat(300), 'فرع ٢٤', 'Café Étoile', '---', '١٢٣'];
    for (const [i, name] of names.entries()) {
      const o = i === 0 ? owner : await add.owner(pg, `o${i}@example.com`);
      await expect(
        pg.query(`INSERT INTO restaurants (owner_id, name, public_slug) VALUES ($1, 'x', $2)`, [o, makeSlug(name)]),
      ).resolves.toBeTruthy();
    }
  });
});
