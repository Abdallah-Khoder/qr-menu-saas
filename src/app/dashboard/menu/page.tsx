import CategoryForm from '@/components/CategoryForm';
import CategoryItems from '@/components/CategoryItems';
import CategoryRow from '@/components/CategoryRow';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { listItems } from '@/lib/owner-items';
import { MAX_CATEGORIES, listCategories } from '@/lib/owner-menu';
import { getMyRestaurant } from '@/lib/owner-page';

export const metadata = { title: 'القائمة' };

export default async function MenuPage() {
  const user = await requireOwner();
  const db = getDb();
  const [categories, items, restaurant] = await Promise.all([listCategories(db, user.id), listItems(db, user.id), getMyRestaurant(user.id)]); // only THIS owner's data
  const suspended = restaurant?.status === 'suspended';
  return (
    <>
      <h1>القائمة</h1>
      <section className="panel">
        <h2>إضافة قسم</h2>
        <p className="note">الأقسام تجمع أصنافك، مثل: مشروبات، سندويشات، حلويات. (حتى {MAX_CATEGORIES} قسمًا)</p>
        <CategoryForm disabled={suspended} />
      </section>
      <section className="panel">
        <h2>إدارة الأقسام</h2>
        {categories.length === 0 ? (
          <div className="empty"><b>لا توجد أقسام بعد</b>أضف أول قسم من النموذج أعلاه.</div>
        ) : (
          <ul className="rows">
            {categories.map((c, i) => (
              <CategoryRow key={c.id} category={c} first={i === 0} last={i === categories.length - 1} disabled={suspended} />
            ))}
          </ul>
        )}
      </section>
      {restaurant && categories.map((c) => (
        <CategoryItems
          key={c.id} category={c} categories={categories} currencies={restaurant.currencies} disabled={suspended}
          items={items.filter((i) => i.category_id === c.id)}
        />
      ))}
    </>
  );
}
