import type { CurrentUser } from './current-user';
import { isJsonRequest } from './json-request';

/**
 * The check every owner endpoint runs FIRST (same idea as checkAdminRequest).
 * Which restaurant is meant is never taken from the request: the data functions find it
 * from the logged-in owner's id, so an owner cannot touch another restaurant by sending its id.
 */
export function checkOwnerRequest(request: Request, user: CurrentUser | null): Response | null {
  if (!user) return Response.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
  if (user.role !== 'owner') return Response.json({ error: 'غير مصرّح لك بهذا الإجراء' }, { status: 403 });
  if (!isJsonRequest(request)) return Response.json({ error: 'نوع الطلب غير مقبول' }, { status: 415 });
  return null;
}
