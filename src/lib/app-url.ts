/** The public address of the site (no trailing slash). Set APP_URL in production. */
export function appUrl(): string {
  const base = process.env.APP_URL ?? (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  if (!base) throw new Error('APP_URL is not set');
  return base.replace(/\/$/, '');
}
