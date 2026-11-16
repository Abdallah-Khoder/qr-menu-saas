import { z } from 'zod';
import { ownerRoute } from '@/lib/owner-route';
import { renameCategory } from '@/lib/owner-menu';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: z.object({ name: z.string().max(400) }), params }, (db, ownerId, body, id) =>
    renameCategory(db, ownerId, id, body.name));
}
