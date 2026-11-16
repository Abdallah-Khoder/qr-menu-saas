import { z } from 'zod';
import { ownerRoute } from '@/lib/owner-route';
import { deleteCategory } from '@/lib/owner-menu';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({}), params }, (db, ownerId, _body, id) => deleteCategory(db, ownerId, id));
}
