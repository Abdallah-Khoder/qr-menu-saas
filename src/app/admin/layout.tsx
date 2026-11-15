import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';
import { requireSuperAdmin } from '@/lib/current-user';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin(); // the real check: runs on every request
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">منيو QR</div>
        <Link className="nav-link active" href="/admin">نظرة عامة</Link>
        <span className="nav-link" aria-disabled="true">المطاعم (قريباً)</span>
        <span className="nav-link" aria-disabled="true">الدعوات (قريباً)</span>
        <div className="spacer" />
        <div className="who" dir="ltr">{user.email}</div>
        <LogoutButton />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
