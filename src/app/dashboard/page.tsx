import CopyField from '@/components/CopyField';
import LogoutButton from '@/components/LogoutButton';
import { appUrl } from '@/lib/app-url';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { qrSvg } from '@/lib/qr';

export const metadata = { title: 'لوحة المطعم' };

export default async function OwnerDashboard() {
  const user = await requireOwner();
  // Only the restaurant of THIS owner: the query is filtered by his id.
  const res = await getDb().query(`SELECT name, public_slug FROM restaurants WHERE owner_id = $1`, [user.id]);
  const restaurant = res.rows[0] as { name: string; public_slug: string } | undefined;
  const base = appUrl();
  const menuLink = restaurant ? `${base}/m/${restaurant.public_slug}` : null;
  const qr = menuLink ? await qrSvg(menuLink) : null;

  return (
    <main className="auth-wrap">
      <div className="auth-card wide">
        <h1 className="logo">أهلًا بك</h1>
        <p className="sub" dir="ltr">{user.email}</p>
        {restaurant && menuLink && qr && (
          <>
            <h2>{restaurant.name}</h2>
            <CopyField label="رابط لوحة التحكم (احفظه لتدخل منه)" value={`${base}/dashboard`} />
            <CopyField label="رابط قائمتك للزبائن (ضعه على إنستغرام وواتساب)" value={menuLink} />
            <div className="qr-box">
              <span className="copy-label">رمز QR لقائمتك (اطبعه وضعه على الطاولات)</span>
              <div className="qr" role="img" aria-label="رمز QR لرابط القائمة" dangerouslySetInnerHTML={{ __html: qr }} />
            </div>
          </>
        )}
        <p className="note">إعداد القائمة (الأصناف والأسعار) سيتوفّر في الخطوات القادمة.</p>
        <LogoutButton />
      </div>
    </main>
  );
}
