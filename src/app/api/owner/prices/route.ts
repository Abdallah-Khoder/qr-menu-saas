import { z } from 'zod';
import { idSchema } from '@/lib/admin-guard';
import { fillPrices } from '@/lib/owner-prices';
import { ownerRoute } from '@/lib/owner-route';

const Body = z.object({
  prices: z.array(z.object({ itemId: idSchema, label: z.string().max(40), price: z.string().max(40) })).max(2000),
});

export async function POST(request: Request) {
  return ownerRoute(request, { schema: Body }, (db, ownerId, body) => fillPrices(db, ownerId, body.prices));
}
