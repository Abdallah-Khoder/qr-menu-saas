// Usage:  npm run backup          (the dev database, from .env.local)
//         npm run backup:prod     (the real database, from .env.production.local)
//
// Writes ONE file into the `backups/` folder (ignored by git). It only READS the database, nothing is changed.
// The file holds emails and password hashes: keep it private, never upload it anywhere public.
import pg from 'pg';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { exportBackup } from './backup-lib.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (see .env.example).');
  process.exit(1);
}
const { host, pathname } = new URL(url);
const database = `${host}${pathname}`; // never the password
console.log(`Backing up: ${database}`);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const data = await exportBackup(client, { database });
  const dir = fileURLToPath(new URL('../backups/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const stamp = data.createdAt.slice(0, 19).replace(/[:T]/g, '-'); // 2026-11-25-13-40-05
  const file = `${dir}backup-${host.split('.')[0]}-${stamp}.json`;
  writeFileSync(file, JSON.stringify(data, null, 1), { mode: 0o600, flag: 'wx' } /* wx: never overwrite an older backup */);
  chmodSync(file, 0o600);
  console.log(`Saved: ${file}`);
  console.log(Object.entries(data.counts).map(([t, n]) => `  ${t}: ${n}`).join('\n'));
  console.log('Photos are not in the file (only their links). Keep the file private: it has emails and password hashes.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
