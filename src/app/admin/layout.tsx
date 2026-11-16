import Brand from '@/components/Brand';
import NavLinks from '@/components/NavLinks';
import LogoutButton from '@/components/LogoutButton';
import { requireSuperAdmin } from '@/lib/current-user';

const LINKS = [
  { href: '/admin', label: 'نظرة عامة' },
  { href: '/admin/restaurants', label: 'المطاعم' },
  { href: '/admin/invites', label: 'الدعوات' },
];

export const metadata = { title: 'لوحة الإدارة' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin(); // the real check: runs on every request
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <NavLinks links={LINKS} />
        <div className="spacer" />
        <div className="who" dir="ltr">{user.email}</div>
        <LogoutButton />
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
