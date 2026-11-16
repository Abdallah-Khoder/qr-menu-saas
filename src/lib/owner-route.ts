import type { z } from 'zod';
import { idSchema, notFound, readBody } from './admin-guard';
import { getCurrentUser } from './current-user';
import { getDb } from './db';
import type { Db } from './db';
import { checkOwnerRequest } from './owner-guard';
import type { Result } from './owner-menu';

/**
 * Shared shape of every owner endpoint: who are you → is it JSON → valid id → valid body → do it.
 * `run` receives the OWNER's id (never a restaurant id from the request).
 */
export async function ownerRoute<S extends z.ZodTypeAny>(
  request: Request,
  options: { schema: S; params?: Promise<{ id: string }> },
  run: (db: Db, ownerId: string, body: z.infer<S>, id: string) => Promise<Result>,
): Promise<Response> {
  const user = await getCurrentUser();
  const denied = checkOwnerRequest(request, user);
  if (denied || !user) return denied ?? Response.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
  let id = '';
  if (options.params) {
    const parsed = idSchema.safeParse((await options.params).id);
    if (!parsed.success) return notFound();
    id = parsed.data;
  }
  const body = await readBody(request, options.schema);
  if (body instanceof Response) return body;
  const result = await run(getDb(), user.id, body, id);
  return result.ok ? Response.json({ ok: true }) : Response.json({ error: result.error }, { status: result.status });
}
