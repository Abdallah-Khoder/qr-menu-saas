import { z } from 'zod';
import { deleteItem } from '@/lib/owner-items';
import { ownerRoute } from '@/lib/owner-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({}), params }, (db, ownerId, _body, id) => deleteItem(db, ownerId, id));
}
