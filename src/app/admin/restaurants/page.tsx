import CopyField from '@/components/CopyField';
import RowAction from '@/components/RowAction';
import { appUrl } from '@/lib/app-url';
import { requireSuperAdmin } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { listRestaurants } from '@/lib/restaurants-admin';

export const metadata = { title: 'المطاعم' };

export default async function RestaurantsPage() {
  await requireSuperAdmin(); // the page that reads data checks by itself
  const restaurants = await listRestaurants(getDb());
  const base = appUrl();
  return (
    <>
      <h1>المطاعم</h1>
      <section className="panel">
        {restaurants.length === 0 ? (
          <div className="empty"><b>لا توجد مطاعم بعد</b>عندما يُنشئ أصحاب المطاعم حساباتهم عبر الدعوات ستظهر هنا.</div>
        ) : (
          <ul className="rows">
            {restaurants.map((r) => {
              const suspended = r.status === 'suspended';
              return (
                <li className="row wrap" key={r.id}>
                  <div className="row-main">
                    <b>{r.name}</b>
                    <small dir="ltr" className="email">{r.owner_email}</small>
                    <small>أُنشئ {formatDateTime(r.created_at)}</small>
                    <CopyField label="الرابط العام للقائمة" value={`${base}/m/${r.public_slug}`} />
                  </div>
                  <span className={`badge ${suspended ? 'warn' : 'ok'}`}>{suspended ? 'موقوف' : 'نشط'}</span>
                  <div className="actions">
                    <RowAction
                      url={`/api/admin/restaurants/${r.id}/status`}
                      body={{ status: suspended ? 'active' : 'suspended' }}
                      label={suspended ? 'تفعيل' : 'إيقاف'}
                    />
                    <RowAction
                      url={`/api/admin/restaurants/${r.id}/delete`}
                      body={{ withAccount: true }}
                      label="حذف المطعم والحساب"
                      confirm={`سيُحذف مطعم «${r.name}» بقائمته كاملةً (الأقسام والمنتجات)، وحساب ${r.owner_email} نهائيًا. لا يمكن التراجع. بعد الحذف يمكنك دعوة هذا البريد من جديد. هل تريد المتابعة؟`}
                      confirmLabel="نعم، احذف"
                      danger
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
