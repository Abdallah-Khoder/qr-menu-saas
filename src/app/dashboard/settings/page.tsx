import SettingsForm from '@/components/SettingsForm';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getOwnerRestaurant } from '@/lib/owner-menu';

export const metadata = { title: 'الإعدادات' };

export default async function SettingsPage() {
  const user = await requireOwner();
  const restaurant = await getOwnerRestaurant(getDb(), user.id);
  if (!restaurant) return <p className="note">لا يوجد مطعم مرتبط بحسابك. تواصل مع الإدارة.</p>;
  return (
    <>
      <h1>الإعدادات</h1>
      <section className="panel">
        <SettingsForm restaurant={restaurant} />
      </section>
    </>
  );
}
