import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import SignupForm from '@/components/SignupForm';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getInviteEmail } from '@/lib/signup';

export const metadata = {
  title: 'إنشاء حساب المطعم',
  referrer: 'no-referrer' as const, // the link holds the secret token: never pass it on to other sites
  robots: { index: false, follow: false },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');

  // Unknown, used, expired and replaced links all look the same on purpose.
  const email = typeof token === 'string' && token.length <= 200 ? await getInviteEmail(getDb(), token) : null;

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand as="h1" />
        {email && typeof token === 'string' ? (
          <>
            <p className="sub">أنشئ حساب مطعمك وابدأ بإعداد قائمة الطعام</p>
            <SignupForm token={token} email={email} />
          </>
        ) : (
          <>
            <p className="error" role="alert">الرابط غير صالح</p>
            <p className="sub">قد يكون الرابط منتهي الصلاحية أو مستخدمًا من قبل. اطلب دعوة جديدة.</p>
          </>
        )}
      </div>
    </main>
  );
}
