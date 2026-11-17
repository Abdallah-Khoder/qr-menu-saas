import Link from 'next/link';
import FillPrices from '@/components/FillPrices';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { listMissingPrices } from '@/lib/owner-prices';
import { getMyRestaurant } from '@/lib/owner-page';

export const metadata = { title: 'إكمال الأسعار' };

export default async function PricesPage() {
  const user = await requireOwner();
  const [data, restaurant] = await Promise.all([listMissingPrices(getDb(), user.id), getMyRestaurant(user.id)]);
  if (!data) return <p className="note">لا يوجد مطعم مرتبط بحسابك. تواصل مع الإدارة.</p>;
  const name = data.target === 'LBP' ? 'الليرة' : 'الدولار';
  return (
    <>
      <h1>إكمال الأسعار</h1>
      <section className="panel">
        {data.target === null ? (
          <p className="note">مطعمك يعرض العملتين، فلا توجد أسعار ناقصة.</p>
        ) : data.rows.length === 0 ? (
          <p className="note">جميع الأسعار مكتملة بـ{name}. يمكنك الآن اختيارها من الإعدادات.</p>
        ) : (
          <>
            <p className="note">
              هذه المنتجات والأحجام بلا سعر بـ{name}. اكتب الأسعار ثم احفظ؛ تبقى مخفية عن الزبائن إلى أن تختار هذه العملة من الإعدادات.
              يمكنك ترك بعض الخانات فارغة وإكمالها لاحقًا.
            </p>
            <FillPrices rows={data.rows} target={data.target} disabled={restaurant?.status === 'suspended'} />
          </>
        )}
        <p className="note back-link"><Link href="/dashboard/settings">العودة إلى الإعدادات</Link></p>
      </section>
    </>
  );
}
