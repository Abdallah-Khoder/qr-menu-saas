import { redirect } from 'next/navigation';
import LoginForm from '@/components/LoginForm';
import { getCurrentUser } from '@/lib/current-user';

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === 'super_admin' ? '/admin' : '/dashboard');
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo">منيو QR</h1>
        <p className="sub">سجّل دخولك لإدارة المنيو</p>
        <LoginForm />
      </div>
    </main>
  );
}
