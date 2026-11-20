import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { handleImageUpload } from '@/lib/image-upload';

// Not through ownerRoute: an upload changes nothing a customer can see yet (the link only appears on the menu
// when the owner saves the item), so there is no cached menu to refresh.
export async function POST(request: Request) {
  const out = await handleImageUpload(request, await getCurrentUser(), getDb());
  return Response.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
