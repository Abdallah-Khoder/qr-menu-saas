import Brand from '@/components/Brand';
import LogoutButton from '@/components/LogoutButton';
import NavLinks from '@/components/NavLinks';
import { requireOwner } from '@/lib/current-user';
import { SUSPENDED_MESSAGE } from '@/lib/owner-menu';
import { getMyRestaurant } from '@/lib/owner-page';
import ViewMenuLink from '@/components/ViewMenuLink';

const LINKS = [
  { href: '/dashboard', label: 'الرئيسية' },
  { href: '/dashboard/menu', label: 'القائمة' },
  { href: '/dashboard/qr', label: 'رمز QR' },
  { href: '/dashboard/settings', label: 'الإعدادات' },
];

// the template is repeated here: a title set in a layout stops the root one from reaching the pages below it
export const metadata = { title: { default: 'لوحة المطعم', template: '%s | منيو QR' } };

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  const user = await requireOwner(); // the real check: runs on every request
  const restaurant = await getMyRestaurant(user.id);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        {restaurant?.status === 'active' && (
          <ViewMenuLink slug={restaurant.public_slug} className="btn view-menu">عرض قائمتي ↗</ViewMenuLink>
        )}
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
