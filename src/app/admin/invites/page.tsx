import InviteForm from '@/components/InviteForm';
import RowAction from '@/components/RowAction';
import { requireSuperAdmin } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { INVITE_MINUTES, listInvites, type InviteStatus } from '@/lib/invites';

export const metadata = { title: 'الدعوات' };

const STATUS: Record<InviteStatus, { label: string; cls: string }> = {
  open: { label: 'مفتوحة', cls: 'ok' },
  used: { label: 'مستخدمة', cls: 'info' },
  expired: { label: 'منتهية', cls: 'muted' },
};

export default async function InvitesPage() {
  await requireSuperAdmin(); // the page that reads data checks by itself
  const invites = await listInvites(getDb());
  return (
    <>
      <h1>الدعوات</h1>
      <section className="panel">
        <h2>دعوة صاحب مطعم</h2>
        <p className="note">يصله بريد إلكتروني فيه رابط لإنشاء حسابه. الرابط صالح {INVITE_MINUTES} دقيقة فقط ويُستعمل مرة واحدة.</p>
        <InviteForm />
      </section>
      <section className="panel">
        <h2>كل الدعوات</h2>
        {invites.length === 0 ? (
          <div className="empty"><b>لا توجد دعوات بعد</b>أرسل أول دعوة من النموذج أعلاه.</div>
        ) : (
          <ul className="rows">
            {invites.map((i) => (
              <li className="row" key={i.id}>
                <div className="row-main">
                  <span dir="ltr" className="email">{i.email}</span>
                  <small>أُنشئت {formatDateTime(i.created_at)}</small>
                </div>
                <span className={`badge ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                {i.status === 'open' && (
                  <RowAction url={`/api/admin/invites/${i.id}/revoke`} label="إلغاء" confirm="هل تريد إلغاء هذه الدعوة؟" />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
