import { z } from 'zod';
import { moveItem } from '@/lib/owner-items';
import { ownerRoute } from '@/lib/owner-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({ direction: z.enum(['up', 'down']) }), params }, (db, ownerId, body, id) =>
    moveItem(db, ownerId, id, body.direction));
}
