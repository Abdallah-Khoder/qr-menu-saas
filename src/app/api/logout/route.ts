import { cookies } from 'next/headers';
import { SESSION_COOKIE } from '@/lib/session';

export async function POST(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    return Response.json({ error: 'نوع الطلب غير مقبول' }, { status: 415 });
  }
  (await cookies()).delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
