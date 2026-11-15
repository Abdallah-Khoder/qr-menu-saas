import { checkAdminRequest, idSchema, notFound } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { revokeInvite } from '@/lib/invites';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = checkAdminRequest(request, await getCurrentUser());
  if (denied) return denied;
  const id = idSchema.safeParse((await params).id);
  if (!id.success) return notFound();
  return (await revokeInvite(getDb(), id.data)) ? Response.json({ ok: true }) : notFound();
}
