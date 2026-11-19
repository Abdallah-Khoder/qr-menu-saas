import { getDb } from '@/lib/db';
import { handleReset } from '@/lib/password-reset-request';

export async function POST(request: Request) {
  const out = await handleReset(request, getDb());
  return Response.json(out.body, { status: out.status });
}
