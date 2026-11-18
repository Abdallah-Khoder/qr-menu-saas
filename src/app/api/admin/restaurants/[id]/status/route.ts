import { z } from 'zod';
import { checkAdminRequest, idSchema, notFound, readBody } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { refreshMenu, slugOfRestaurant } from '@/lib/public-cache';
import { setRestaurantStatus } from '@/lib/restaurants-admin';

const Body = z.object({ status: z.enum(['active', 'suspended']) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAdminRequest(request, await getCurrentUser());
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  const db = getDb();
  if (!(await setRestaurantStatus(db, id.data, body.status))) return notFound();
  refreshMenu(await slugOfRestaurant(db, id.data)); // customers must see the new state at once
  return Response.json({ ok: true });
}
