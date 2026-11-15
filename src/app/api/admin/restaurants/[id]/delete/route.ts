import { z } from 'zod';
import { checkAdminRequest, idSchema, notFound, readBody } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { deleteOwnerAccount, deleteRestaurant } from '@/lib/restaurants-admin';

// withAccount: false = delete the restaurant only (the owner can log in and start again);
//              true  = delete the owner's account too.
const Body = z.object({ withAccount: z.boolean() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAdminRequest(request, await getCurrentUser());
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  const done = body.withAccount ? await deleteOwnerAccount(getDb(), id.data) : await deleteRestaurant(getDb(), id.data);
  return done ? Response.json({ ok: true }) : notFound();
}
