// Creates the first super-admin (you). Run: npm run create-admin
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';
import { hashPassword } from '../src/lib/password.mjs';
import { checkNewCredentials } from '../src/lib/credentials.mjs';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (check your .env file).');
  process.exit(1);
}
const u = new URL(url);
console.log(`Target database: ${u.host}${u.pathname}`);

/** Asks a question; when hidden, the typed characters are not shown. */
async function ask(question, hidden = false) {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  const p = rl.question(question);
  muted = hidden;
  const answer = await p;
  rl.close();
  if (hidden) process.stdout.write('\n');
  return answer;
}

const confirm = process.argv.includes('--confirm');
if (confirm) {
  const yes = await ask('This is a PRODUCTION-style run. Type "yes" to continue: ');
  if (yes.trim() !== 'yes') process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const existing = await client.query(`SELECT 1 FROM users WHERE role = 'super_admin' LIMIT 1`);
  if (existing.rowCount > 0) {
    console.error('A super-admin already exists. Nothing to do.');
    process.exit(1);
  }
  const email = (await ask('Email: ')).trim().toLowerCase();
  const password = await ask('Password (12 to 200 characters): ', true);
  const problem = checkNewCredentials(email, password);
  if (problem) throw new Error(problem);
  const again = await ask('Repeat password: ', true);
  if (password !== again) throw new Error('The two passwords are different.');

  await client.query(
    `INSERT INTO users (email, password_hash, role, email_verified_at)
     VALUES ($1, $2, 'super_admin', now())`,
    [email, await hashPassword(password)],
  );
  console.log(`Created super-admin ${email}`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
