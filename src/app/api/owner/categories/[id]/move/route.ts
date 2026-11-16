import { z } from 'zod';
import { ownerRoute } from '@/lib/owner-route';
import { moveCategory } from '@/lib/owner-menu';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({ direction: z.enum(['up', 'down']) }), params }, (db, ownerId, body, id) =>
    moveCategory(db, ownerId, id, body.direction));
}
