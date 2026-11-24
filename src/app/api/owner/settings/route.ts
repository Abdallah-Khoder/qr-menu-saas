import { z } from 'zod';
import { ownerRoute } from '@/lib/owner-route';
import { saveSettings } from '@/lib/owner-menu';

const Body = z.object({
  name: z.string().max(400),
  currencies: z.enum(['USD', 'LBP', 'BOTH']),
  phone: z.string().max(100),
  instagram: z.string().max(1000),
  facebook: z.string().max(1000),
  tiktok: z.string().max(1000),
  direction: z.enum(['rtl', 'ltr']).optional(),
  locations: z.array(z.object({ name: z.string().max(400), mapUrl: z.string().max(1000) })).max(60).optional(),
});

export async function POST(request: Request) {
  return ownerRoute(request, { schema: Body }, (db, ownerId, body) => saveSettings(db, ownerId, body));
}
