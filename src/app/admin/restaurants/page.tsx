import RowAction from '@/components/RowAction';
import { requireSuperAdmin } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { listRestaurants } from '@/lib/restaurants-admin';

export const metadata = { title: 'المطاعم' };

export default async function RestaurantsPage() {
  await requireSuperAdmin(); // the page that reads data checks by itself
  const restaurants = await listRestaurants(getDb());
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
                    <small dir="ltr">{r.public_slug}</small>
                    <small>أُنشئ {formatDateTime(r.created_at)}</small>
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
                      body={{ withAccount: false }}
                      label="حذف المطعم"
                      confirm={`سيُحذف مطعم «${r.name}» وقائمته بالكامل، ويبقى حساب صاحبه. لا يمكن التراجع. هل تريد المتابعة؟`}
                      danger
                    />
                    <RowAction
                      url={`/api/admin/restaurants/${r.id}/delete`}
                      body={{ withAccount: true }}
                      label="حذف الحساب"
                      confirm={`سيُحذف حساب ${r.owner_email} ومطعمه وقائمته بالكامل. لا يمكن التراجع. هل تريد المتابعة؟`}
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
