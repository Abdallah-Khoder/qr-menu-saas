import Link from 'next/link';
import SettingsForm from '@/components/SettingsForm';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { listMissingPrices } from '@/lib/owner-prices';
import { getMyRestaurant } from '@/lib/owner-page';

export const metadata = { title: 'الإعدادات' };

export default async function SettingsPage() {
  const user = await requireOwner();
  const restaurant = await getMyRestaurant(user.id);
  if (!restaurant) return <p className="note">لا يوجد مطعم مرتبط بحسابك. تواصل مع الإدارة.</p>;
  const missing = await listMissingPrices(getDb(), user.id);
  const other = missing?.target === 'LBP' ? 'الليرة' : 'الدولار';
  return (
    <>
      <h1>الإعدادات</h1>
      {missing && missing.rows.length > 0 && (
        <section className="panel">
          <h2>أسعار ناقصة بـ{other}</h2>
          <p className="note">
            يوجد {missing.rows.length} منتج أو حجم بلا سعر بـ{other}. لا يمكن اختيار هذه العملة قبل إكمال أسعارها،
            وتبقى مخفية عن الزبائن إلى أن تختارها.
          </p>
          <Link className="btn" href="/dashboard/menu/prices">إكمال الأسعار</Link>
        </section>
      )}
      <section className="panel">
        <SettingsForm restaurant={restaurant} disabled={restaurant.status === 'suspended'} />
      </section>
    </>
  );
}
