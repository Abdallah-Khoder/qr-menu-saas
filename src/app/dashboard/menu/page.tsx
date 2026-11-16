import CategoryForm from '@/components/CategoryForm';
import CategoryRow from '@/components/CategoryRow';
import { requireOwner } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { MAX_CATEGORIES, listCategories } from '@/lib/owner-menu';

export const metadata = { title: 'القائمة' };

export default async function MenuPage() {
  const user = await requireOwner();
  const categories = await listCategories(getDb(), user.id); // only THIS owner's categories
  return (
    <>
      <h1>القائمة</h1>
      <section className="panel">
        <h2>إضافة قسم</h2>
        <p className="note">الأقسام تجمع أصنافك، مثل: مشروبات، سندويشات، حلويات. (حتى {MAX_CATEGORIES} قسمًا)</p>
        <CategoryForm />
      </section>
      <section className="panel">
        <h2>الأقسام</h2>
        {categories.length === 0 ? (
          <div className="empty"><b>لا توجد أقسام بعد</b>أضف أول قسم من النموذج أعلاه.</div>
        ) : (
          <ul className="rows">
            {categories.map((c, i) => (
              <CategoryRow key={c.id} category={c} first={i === 0} last={i === categories.length - 1} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
