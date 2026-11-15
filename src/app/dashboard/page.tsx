import LogoutButton from '@/components/LogoutButton';
import { requireOwner } from '@/lib/current-user';

export default async function OwnerDashboard() {
  const user = await requireOwner();
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo">أهلاً فيك</h1>
        <p className="sub" dir="ltr">{user.email}</p>
        <p>لوحة صاحب المطعم عم تتجهّز، وبتنفتح بالخطوات الجاية.</p>
        <LogoutButton />
      </div>
    </main>
  );
}
