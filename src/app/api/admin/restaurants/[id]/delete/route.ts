import { z } from 'zod';
import { checkAdminRequest, idSchema, notFound, readBody } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { forgetRestaurantImages } from '@/lib/image-storage';
import { refreshMenu, slugOfRestaurant } from '@/lib/public-cache';
import { deleteOwnerAccount } from '@/lib/restaurants-admin';

// The only delete is "restaurant AND account". withAccount must be exactly true: an old open admin page that
// still sends false (the removed "restaurant only" button) gets a 400 instead of deleting more than it asked.
const Body = z.object({ withAccount: z.literal(true) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAdminRequest(request, await getCurrentUser());
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  const db = getDb();
  const slug = await slugOfRestaurant(db, id.data); // asked first: after the delete the row is gone
  const done = await deleteOwnerAccount(db, id.data);
  if (!done) return notFound();
  refreshMenu(slug);
  await forgetRestaurantImages(id.data); // best effort: the photos of the deleted restaurant
  return Response.json({ ok: true });
}
