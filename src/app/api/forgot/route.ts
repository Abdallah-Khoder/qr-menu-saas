import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { handleForgot } from '@/lib/password-reset-request';

export async function POST(request: Request) {
  // The mail is sent AFTER the answer went out, so the answer is equally fast whether or not an account exists.
  const out = await handleForgot(request, getDb(), (mail) => {
    after(async () => {
      try {
        await sendEmail(mail);
      } catch (e) {
        console.error('Reset email failed:', e instanceof Error ? e.message : e);
      }
    });
  });
  return Response.json(out.body, { status: out.status });
}
