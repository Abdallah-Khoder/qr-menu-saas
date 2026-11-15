import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string; html: string };
/** Anything that can deliver a mail. Tests pass a fake one, so no real email is ever sent. */
export type Sender = (mail: Mail) => Promise<void>;

/**
 * Sends through any SMTP service (Gmail, Brevo, ...): the provider is chosen only by
 * environment variables, never in the code.
 *
 * Without SMTP_HOST, on your own computer the mail is printed in the terminal instead
 * (so you can click the link while developing). On the deployed site that would leak the
 * secret link into the server logs, so there it refuses to run.
 */
export const sendEmail: Sender = async (mail) => {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP_HOST is not set');
    console.log(`\n--- email NOT sent (SMTP_HOST is not set), printed here instead ---\nTo: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n---\n`);
    return;
  }
  const from = process.env.EMAIL_FROM;
  if (!from) throw new Error('EMAIL_FROM is not set');
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({ from, ...mail });
};
