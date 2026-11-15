import { redirect } from 'next/navigation';
import Brand from '@/components/Brand';
import LoginForm from '@/components/LoginForm';
import { getCurrentUser } from '@/lib/current-user';

export const metadata = { title: 'تسجيل الدخول' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Brand as="h1" />
        <p className="sub">سجّل الدخول لإدارة قائمة الطعام</p>
        <LoginForm />
      </div>
    </main>
  );
}
