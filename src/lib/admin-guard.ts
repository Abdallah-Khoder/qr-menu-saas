import { z } from 'zod';
import type { CurrentUser } from './current-user';

export const idSchema = z.string().uuid();

/**
 * The check every admin endpoint runs FIRST, before touching any data.
 * Returns an error response to send back, or null when the request may continue.
 * (The user is passed in, so this can be tested without Next.)
 */
export function checkAdminRequest(request: Request, user: CurrentUser | null): Response | null {
  if (!user) return Response.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
  if (user.role !== 'super_admin') return Response.json({ error: 'غير مصرّح لك بهذا الإجراء' }, { status: 403 });
  // A form on another website cannot send JSON with this header, which blocks cross-site posts.
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'نوع الطلب غير مقبول' }, { status: 415 });
  }
  return null;
}

/** Reads and validates the JSON body. Returns the data, or a 400 response. */
export async function readBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.infer<S> | Response> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: 'طلب غير صالح' }, { status: 400 });
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : Response.json({ error: 'طلب غير صالح' }, { status: 400 });
}

export const notFound = () => Response.json({ error: 'العنصر غير موجود' }, { status: 404 });
