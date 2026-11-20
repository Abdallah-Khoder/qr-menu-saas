import { describe, expect, it } from 'vitest';
import nextConfig from '../next.config';
import robots from '@/app/robots';

describe('security headers', () => {
  it('are sent on every path', async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe('/:path*');
    const h = Object.fromEntries(rules[0].headers.map((x) => [x.key, x.value]));
    expect(h['X-Content-Type-Options']).toBe('nosniff');
    expect(h['X-Frame-Options']).toBe('DENY');
    expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(h['Strict-Transport-Security']).toMatch(/^max-age=\d{8,}/);
    expect(h['Permissions-Policy']).toContain('camera=()');
    expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  });

  it('keep scripts working: the policy must not limit script sources (Next.js uses inline scripts)', async () => {
    const rules = await nextConfig.headers!();
    const csp = rules[0].headers.find((x) => x.key === 'Content-Security-Policy')!.value;
    expect(csp).not.toMatch(/script-src|default-src/);
  });

  it('do not announce the framework', () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });
});

describe('robots.txt', () => {
  it('hides the private areas from search engines but not the whole site', () => {
    const rules = robots().rules as { userAgent: string; disallow: string[] };
    expect(rules.userAgent).toBe('*');
    for (const p of ['/dashboard', '/admin', '/api/', '/login', '/signup', '/forgot', '/reset']) {
      expect(rules.disallow).toContain(p);
    }
    expect(rules.disallow).not.toContain('/');
    expect(rules.disallow).not.toContain('/m/'); // the customers' pages carry their own "noindex"
  });
});
