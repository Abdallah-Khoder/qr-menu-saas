import type { CurrentUser } from './current-user';
import type { Db } from './db';
import { getOwnerRestaurant } from './owner-menu';
import { qrPng, qrSvg } from './qr';

/**
 * The QR file of the logged-in owner's menu link. The restaurant is found from the logged-in user,
 * never from the request, so nobody can ask for another restaurant's file.
 * Sent as an attachment (the browser saves it instead of opening it), never stored by caches.
 */
export async function qrDownload(db: Db, user: CurrentUser | null, format: string | null, appBase: string): Promise<Response> {
  if (!user) return Response.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
  if (user.role !== 'owner') return Response.json({ error: 'غير مصرّح لك بهذا الإجراء' }, { status: 403 });
  if (format !== 'svg' && format !== 'png') return Response.json({ error: 'الصيغة غير مدعومة' }, { status: 400 });
  const restaurant = await getOwnerRestaurant(db, user.id);
  if (!restaurant) return Response.json({ error: 'المطعم غير موجود' }, { status: 404 });

  const link = `${appBase}/m/${restaurant.public_slug}`;
  const headers = {
    'Content-Disposition': `attachment; filename="menu-qr.${format}"`, // fixed name: nothing from the user goes in a header
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (format === 'svg') return new Response(await qrSvg(link), { headers: { ...headers, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
  return new Response(new Uint8Array(await qrPng(link)), { headers: { ...headers, 'Content-Type': 'image/png' } });
}

