import { getDb } from '@/lib/db';
import { getAdminStats } from '@/lib/admin-stats';
import { requireSuperAdmin } from '@/lib/current-user';

export default async function AdminHome() {
  // The layout checks too, but layouts are not re-run on every navigation: the page that reads data must check itself.
  await requireSuperAdmin();
  const s = await getAdminStats(getDb());
  return (
    <>
      <h1>نظرة عامة</h1>
      <div className="stats">
        <div className="stat"><b>{s.restaurants}</b><small>كل المطاعم</small></div>
        <div className="stat"><b>{s.active}</b><small>مطاعم شغّالة</small></div>
        <div className="stat"><b>{s.suspended}</b><small>مطاعم موقوفة</small></div>
        <div className="stat"><b>{s.openInvites}</b><small>دعوات مفتوحة</small></div>
      </div>
      {s.restaurants === 0 && (
        <section className="panel">
          <div className="empty">
            <b>لسا ما في مطاعم</b>
            بالخطوة الجاية بتقدر تعمل دعوة وترسلها لصاحب مطعم ليسجّل.
          </div>
        </section>
      )}
    </>
  );
}
