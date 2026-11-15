import { z } from 'zod';
import { checkAdminRequest, readBody } from '@/lib/admin-guard';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { createInvite } from '@/lib/invites';

const Body = z.object({ email: z.string().max(254) });

const MESSAGES = {
  invalid_email: [400, 'البريد الإلكتروني غير صالح. استعمل أحرفًا وأرقامًا إنجليزية.'],
  already_registered: [409, 'هذا البريد الإلكتروني مسجّل مسبقًا.'],
  email_failed: [502, 'تعذّر إرسال الدعوة. تحقّق من إعدادات البريد ثم أعد المحاولة.'],
} as const;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const denied = checkAdminRequest(request, user);
  if (denied) return denied;
  const body = await readBody(request, Body);
  if (body instanceof Response) return body;

  const result = await createInvite(getDb(), user!.id, body.email, sendEmail);
  if (result.ok) return Response.json({ ok: true });
  const [status, error] = MESSAGES[result.reason];
  return Response.json({ error }, { status });
}
