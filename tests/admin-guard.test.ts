import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { checkAdminRequest, idSchema, readBody } from '../src/lib/admin-guard';

const json = { 'content-type': 'application/json' };
const req = (headers: Record<string, string> = json, body = '{}') => new Request('http://x/api/admin/x', { method: 'POST', headers, body });
const admin = { id: 'a', email: 'a@example.com', role: 'super_admin' as const };
const owner = { id: 'o', email: 'o@example.com', role: 'owner' as const };

describe('checkAdminRequest', () => {
  it('lets a super-admin with a JSON request through', () => {
    expect(checkAdminRequest(req(), admin)).toBeNull();
  });
  it('401 when nobody is logged in', async () => {
    expect(checkAdminRequest(req(), null)?.status).toBe(401);
  });
  it('403 for a restaurant owner', async () => {
    expect(checkAdminRequest(req(), owner)?.status).toBe(403);
  });
  it('415 for a non-JSON request, even from the super-admin (cross-site form defence)', () => {
    expect(checkAdminRequest(req({ 'content-type': 'application/x-www-form-urlencoded' }), admin)?.status).toBe(415);
    expect(checkAdminRequest(req({}), admin)?.status).toBe(415);
  });
  it('checks who you are before anything else', () => {
    expect(checkAdminRequest(req({}), owner)?.status).toBe(403);
    expect(checkAdminRequest(req({}), null)?.status).toBe(401);
  });
});

describe('readBody and ids', () => {
  const S = z.object({ n: z.number() });
  it('returns the data when valid', async () => {
    expect(await readBody(req(json, '{"n":1}'), S)).toEqual({ n: 1 });
  });
  it('returns a 400 response for broken or wrong data', async () => {
    for (const body of ['{oops', '{"n":"x"}', '{}']) {
      const r = await readBody(req(json, body), S);
      expect(r).toBeInstanceOf(Response);
      expect((r as Response).status).toBe(400);
    }
  });
  it('only accepts real UUIDs as ids', () => {
    expect(idSchema.safeParse('00000000-0000-4000-8000-000000000000').success).toBe(true);
    for (const bad of ['1', 'abc', "' OR 1=1 --", '']) expect(idSchema.safeParse(bad).success).toBe(false);
  });
});
