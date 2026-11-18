import Link from 'next/link';
import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import ForgotForm from '@/components/ForgotForm';
import { getCurrentUser } from '@/lib/current-user';

export const metadata = { title: 'نسيت كلمة المرور', robots: { index: false, follow: false } };

export default async function ForgotPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand as="h1" />
        <p className="sub">اكتب بريدك الإلكتروني وسنرسل إليك رابطًا لاختيار كلمة مرور جديدة</p>
        <ForgotForm />
        <p className="note"><Link href="/login">العودة إلى تسجيل الدخول</Link></p>
      </div>
    </main>
  );
}
