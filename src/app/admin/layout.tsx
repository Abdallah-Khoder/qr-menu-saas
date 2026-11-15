import Link from 'next/link';
import Brand from '@/components/Brand';
import LogoutButton from '@/components/LogoutButton';
import { requireSuperAdmin } from '@/lib/current-user';

export const metadata = { title: 'لوحة الإدارة' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin(); // the real check: runs on every request
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <Link className="nav-link active" href="/admin">نظرة عامة</Link>
        <span className="nav-link" aria-disabled="true">المطاعم (قريبًا)</span>
        <span className="nav-link" aria-disabled="true">الدعوات (قريبًا)</span>
        <div className="spacer" />
        <div className="who" dir="ltr">{user.email}</div>
        <LogoutButton />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
