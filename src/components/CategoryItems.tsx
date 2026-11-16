'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import ItemForm, { type Currencies, type ItemData } from './ItemForm';
import ItemRow from './ItemRow';

/** The items of one category, with the "add item" form. */
export default function CategoryItems({
  category, items, categories, currencies, disabled,
}: {
  category: { id: string; name: string }; items: ItemData[]; categories: { id: string; name: string }[];
  currencies: Currencies; disabled: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{category.name}</h2>
        {!adding && <button className="btn small" disabled={disabled} onClick={() => setAdding(true)}>+ إضافة منتج</button>}
      </div>
      {adding && (
        <ItemForm
          categories={categories} categoryId={category.id} currencies={currencies} disabled={disabled}
          onCancel={() => setAdding(false)} onDone={() => { setAdding(false); router.refresh(); }}
        />
      )}
      {items.length === 0 && !adding ? (
        <div className="empty"><b>لا توجد منتجات في هذا القسم</b>اضغط «إضافة منتج» للبدء.</div>
      ) : (
        <ul className="rows">
          {items.map((item, i) => (
            <ItemRow key={item.id} item={item} categories={categories} currencies={currencies}
              first={i === 0} last={i === items.length - 1} disabled={disabled} />
          ))}
        </ul>
      )}
    </section>
  );
}
