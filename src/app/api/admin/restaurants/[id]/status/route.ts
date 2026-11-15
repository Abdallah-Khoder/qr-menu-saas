import { z } from 'zod';
import { checkAdminRequest, idSchema, notFound, readBody } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { setRestaurantStatus } from '@/lib/restaurants-admin';

const Body = z.object({ status: z.enum(['active', 'suspended']) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAdminRequest(request, await getCurrentUser());
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;
  return (await setRestaurantStatus(getDb(), id.data, body.status)) ? Response.json({ ok: true }) : notFound();
}
