import Brand from '@/components/Brand';
import LogoutButton from '@/components/LogoutButton';
import NavLinks from '@/components/NavLinks';
import { requireOwner } from '@/lib/current-user';
import { SUSPENDED_MESSAGE } from '@/lib/owner-menu';
import { getMyRestaurant } from '@/lib/owner-page';

const LINKS = [
  { href: '/dashboard', label: 'الرئيسية' },
  { href: '/dashboard/menu', label: 'القائمة' },
  { href: '/dashboard/settings', label: 'الإعدادات' },
];

export const metadata = { title: 'لوحة المطعم' };

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner(); // the real check: runs on every request
  const restaurant = await getMyRestaurant(user.id);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <NavLinks links={LINKS} />
        <div className="spacer" />
        <div className="who" dir="ltr">{user.email}</div>
        <LogoutButton />
      </aside>
      <main className="main">
        {restaurant?.status === 'suspended' && (
          <div className="banner" role="alert">{SUSPENDED_MESSAGE} قائمتك غير ظاهرة للزبائن حاليًا.</div>
        )}
        {children}
      </main>
    </div>
  );
}
