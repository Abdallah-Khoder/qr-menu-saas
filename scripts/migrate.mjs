// Usage:  npm run migrate        (reads DATABASE_URL from .env.local)
//
// Run it against the DEV database first. Run it against production only after the
// change has been tried on dev. Which database it hits depends only on DATABASE_URL.
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { migrate } from './migrate-lib.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Put it in .env.local (see .env.example).');
  process.exit(1);
}

const pool = new pg.Client({ connectionString: url });
await pool.connect();

// Show WHICH database we are about to change (host + name, never the password).
const { host, pathname } = new URL(url);
console.log(`Target database: ${host}${pathname}`);

// pg's simple query protocol accepts several statements in one string,
// as long as there are no parameters, which is what we need for exec().
const client = {
  query: (sql, params) => pool.query(sql, params),
  exec: async (sql) => {
    await pool.query(sql);
  },
};

try {
  const ran = await migrate(client, fileURLToPath(new URL('../db/migrations', import.meta.url)), console.log);
  console.log(ran.length ? `Done: ${ran.length} migration(s) applied.` : 'Nothing to do: database is up to date.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
