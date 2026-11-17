import QrPrint from '@/components/QrPrint';
import { appUrl } from '@/lib/app-url';
import { requireOwner } from '@/lib/current-user';
import { getMyRestaurant } from '@/lib/owner-page';
import { qrSvg } from '@/lib/qr';

export const metadata = { title: 'طباعة رمز QR' };

export default async function QrPage() {
  const user = await requireOwner();
  const restaurant = await getMyRestaurant(user.id);
  if (!restaurant) return <p className="note">لا يوجد مطعم مرتبط بحسابك. تواصل مع الإدارة.</p>;
  const link = `${appUrl()}/m/${restaurant.public_slug}`;
  return (
    <>
      <h1 className="no-print">طباعة رمز QR</h1>
      <section className="panel no-print">
        <p className="note">
          بطاقة جاهزة للطاولات. اطبعها على ورق عادي بطابعة المكتب أو المكتبة، واتركها بالأسود على خلفية بيضاء مع هامش أبيض حول الرمز.
          يفضّل ألا يقل حجم الرمز عن 3 إلى 5 سنتيمترات، وأن تغلّفها بالبلاستيك لتدوم.
          جرّب مسحها بهاتفك قبل طباعة العدد الكامل.
        </p>
      </section>
      <QrPrint name={restaurant.name} svg={await qrSvg(link)} link={link} />
    </>
  );
}
