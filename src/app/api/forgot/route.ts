import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { sendEmail } from '@/lib/email';
import { handleForgot } from '@/lib/password-reset-request';

export async function POST(request: Request) {
  // Looking the email up, writing the link and sending the mail all run AFTER the answer went out
  // (`after`), so the answer takes the same time whether or not an account exists.
  const out = await handleForgot(request, getDb(), sendEmail, (task) => {
    after(task);
  });
  return Response.json(out.body, { status: out.status });
}
