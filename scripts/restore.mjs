// Usage:  npm run restore -- backups/backup-....json        (into the dev database)
//         npm run restore:prod -- backups/backup-....json   (into the real database)
//
// Puts a backup into an EMPTY database that already has the same migrations (run `npm run migrate` on it first).
// It refuses a database that already has data, so it can never overwrite anything.
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { restoreBackup } from './backup-lib.mjs';

const url = process.env.DATABASE_URL;
const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!url || !file) {
  console.error('Usage: npm run restore -- <backup file>   (and DATABASE_URL must be set)');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const { host, pathname } = new URL(url);
console.log(`Backup:   ${file} (made ${data.createdAt}, from ${data.database ?? 'unknown'})`);
console.log(Object.entries(data.counts ?? {}).map(([t, n]) => `  ${t}: ${n}`).join('\n'));
console.log(`Target database: ${host}${pathname}`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question('Put this backup into the target database? Type "yes" to continue: ');
rl.close();
if (answer.trim() !== 'yes') {
  console.log('Cancelled.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await restoreBackup(client, data);
  console.log('Done: the backup is in the database.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
