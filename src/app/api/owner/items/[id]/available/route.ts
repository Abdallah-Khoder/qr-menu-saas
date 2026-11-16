import { z } from 'zod';
import { setItemAvailable } from '@/lib/owner-items';
import { ownerRoute } from '@/lib/owner-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({ available: z.boolean() }), params }, (db, ownerId, body, id) =>
    setItemAvailable(db, ownerId, id, body.available));
}
