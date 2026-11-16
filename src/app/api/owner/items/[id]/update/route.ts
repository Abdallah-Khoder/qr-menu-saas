import { ItemBody } from '@/lib/item-schema';
import { updateItem } from '@/lib/owner-items';
import { ownerRoute } from '@/lib/owner-route';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return ownerRoute(request, { schema: ItemBody, params }, (db, ownerId, body, id) => updateItem(db, ownerId, id, body));
}
