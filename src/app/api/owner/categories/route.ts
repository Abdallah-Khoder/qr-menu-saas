import { z } from 'zod';
import { ownerRoute } from '@/lib/owner-route';
import { createCategory } from '@/lib/owner-menu';

export async function POST(request: Request) {
  return ownerRoute(request, { schema: z.object({ name: z.string().max(400) }) }, (db, ownerId, body) =>
    createCategory(db, ownerId, body.name));
}
