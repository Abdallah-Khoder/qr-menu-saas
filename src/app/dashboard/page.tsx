import LogoutButton from '@/components/LogoutButton';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';

export const metadata = { title: 'لوحة المطعم' };

export default async function OwnerDashboard() {
  const user = await requireOwner();
  // Only the restaurant of THIS owner: the query is filtered by his id.
  const res = await getDb().query(`SELECT name, public_slug FROM restaurants WHERE owner_id = $1`, [user.id]);
  const restaurant = res.rows[0] as { name: string; public_slug: string } | undefined;
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <h1 className="logo">أهلًا بك</h1>
        <p className="sub" dir="ltr">{user.email}</p>
        {restaurant && (
          <>
            <h2>{restaurant.name}</h2>
            <p className="note">
              رابط قائمتك: <bdi dir="ltr">/m/{restaurant.public_slug}</bdi>
            </p>
          </>
        )}
        <p>لوحة صاحب المطعم قيد الإعداد، وستتوفّر في الخطوات القادمة.</p>
        <LogoutButton />
      </div>
    </main>
  );
}
