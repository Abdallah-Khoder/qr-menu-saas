import Link from 'next/link';
import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import ResetForm from '@/components/ResetForm';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getResetEmail } from '@/lib/password-reset';

export const metadata = {
  title: 'كلمة مرور جديدة',
  referrer: 'no-referrer' as const, // the link holds the secret token: never pass it on to other sites
  robots: { index: false, follow: false },
};

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');

  // Unknown, used, expired and replaced links all look the same on purpose.
  const email = typeof token === 'string' && token.length <= 200 ? await getResetEmail(getDb(), token) : null;

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand as="h1" />
        {email && typeof token === 'string' ? (
          <>
            <p className="sub">اختر كلمة مرور جديدة لحسابك</p>
            <ResetForm token={token} email={email} />
          </>
        ) : (
          <>
            <p className="error" role="alert">الرابط غير صالح</p>
            <p className="sub">قد يكون الرابط منتهي الصلاحية أو مستخدمًا من قبل.</p>
            <p className="note"><Link href="/forgot">اطلب رابطًا جديدًا</Link></p>
          </>
        )}
      </div>
    </main>
  );
}
