import LogoutButton from '@/components/LogoutButton';
import { requireOwner } from '@/lib/current-user';

export const metadata = { title: 'لوحة المطعم' };

export default async function OwnerDashboard() {
  const user = await requireOwner();
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo">أهلًا بك</h1>
        <p className="sub" dir="ltr">{user.email}</p>
        <p>لوحة صاحب المطعم قيد الإعداد، وستتوفّر في الخطوات القادمة.</p>
        <LogoutButton />
      </div>
    </main>
  );
}
