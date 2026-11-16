import { z } from 'zod';
import { idSchema } from './admin-guard';

/** What the browser may send when saving an item (the real checks are in owner-items.ts). */
export const ItemBody = z.object({
  categoryId: idSchema,
  name: z.string().max(400),
  description: z.string().max(2000),
  available: z.boolean(),
  priceUsd: z.string().max(40),
  priceLbp: z.string().max(40),
  sizes: z.array(z.object({ label: z.string().max(40), priceUsd: z.string().max(40), priceLbp: z.string().max(40) })).max(20),
});
