import { ItemBody } from '@/lib/item-schema';
import { createItem } from '@/lib/owner-items';
import { ownerRoute } from '@/lib/owner-route';

export async function POST(request: Request) {
  return ownerRoute(request, { schema: ItemBody }, (db, ownerId, body) => createItem(db, ownerId, body));
}
