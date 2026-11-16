import CopyField from '@/components/CopyField';
import { appUrl } from '@/lib/app-url';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { getOwnerRestaurant } from '@/lib/owner-menu';
import { qrSvg } from '@/lib/qr';

export default async function OwnerHome() {
  const user = await requireOwner(); // the page that reads data checks by itself
  const restaurant = await getOwnerRestaurant(getDb(), user.id); // only THIS owner's restaurant
  if (!restaurant) return <p className="note">لا يوجد مطعم مرتبط بحسابك. تواصل مع الإدارة.</p>;

  const base = appUrl();
  const dashboardLink = `${base}/dashboard`;
  const menuLink = `${base}/m/${restaurant.public_slug}`;
  const [dashboardQr, menuQr] = await Promise.all([qrSvg(dashboardLink), qrSvg(menuLink)]);

  return (
    <>
      <h1>{restaurant.name}</h1>
      <section className="panel">
        <h2>قائمة الزبائن</h2>
        <p className="note">هذا الرابط ورمز QR هما ما يراه زبائنك. ضع الرمز على الطاولات والرابط على إنستغرام وواتساب.</p>
        <CopyField label="رابط قائمتك للزبائن" value={menuLink} />
        <div className="qr-box">
          <span className="copy-label">رمز QR لقائمتك (اطبعه وضعه على الطاولات)</span>
          <div className="qr" role="img" aria-label="رمز QR لرابط القائمة" dangerouslySetInnerHTML={{ __html: menuQr }} />
        </div>
      </section>
      <section className="panel">
        <h2>لوحة التحكم</h2>
        <p className="note">للدخول إلى لوحتك بسرعة. تحتاج إلى بريدك وكلمة المرور في كل الأحوال.</p>
        <CopyField label="رابط لوحة التحكم (احفظه لتدخل منه)" value={dashboardLink} />
        <div className="qr-box">
          <span className="copy-label">رمز QR للوحة التحكم</span>
          <div className="qr" role="img" aria-label="رمز QR لرابط لوحة التحكم" dangerouslySetInnerHTML={{ __html: dashboardQr }} />
        </div>
      </section>
    </>
  );
}
