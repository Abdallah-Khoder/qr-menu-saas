'use client';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import ItemForm, { type Currencies, type ItemData } from './ItemForm';
import ItemRow from './ItemRow';

/**
 * 'never' = not opened yet: nothing of the list is built (the page stays light, every category starts like this).
 * After the first opening the list stays on the page for good and is only HIDDEN when closed (folded to zero height, see .cat-body in globals.css): taking it away would
 * throw away what the owner typed in an open "add" form or "edit" form (React forgets the state of what it removes).
 */
export type Fold = 'never' | 'open' | 'closed';
export const toggled = (fold: Fold): Fold => (fold === 'open' ? 'closed' : 'open');

/**
 * The items of one category, with the "add item" form. The list starts CLOSED (an owner with many items would scroll
 * for ages): the arrow opens and closes it, and "+ إضافة منتج" stays on the title line, opening the list as it goes.
 */
export default function CategoryItems({
  category, items, categories, currencies, disabled, initialFold = 'never',
}: {
  category: { id: string; name: string }; items: ItemData[]; categories: { id: string; name: string }[];
  currencies: Currencies; disabled: boolean; initialFold?: Fold;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [fold, setFold] = useState<Fold>(initialFold);
  const open = fold === 'open';
  const bodyId = useId();
  return (
    <section className="panel cat-panel">
      <div className="panel-head">
        <h2 className="cat-title">
          <button type="button" className="cat-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setFold(toggled(fold))}>
            <svg className="cat-arrow" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
              <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="cat-name">{category.name}</span>
            <small>{items.length} صنف</small>
          </button>
        </h2>
        {(!adding || !open) && <button className="btn small" disabled={disabled} onClick={() => { setFold('open'); setAdding(true); }}>+ إضافة منتج</button>}
      </div>
      {fold !== 'never' && (
        <div className="cat-body" id={bodyId} data-open={open}>
          <div className="cat-inner">
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
          </div>
        </div>
      )}
    </section>
  );
}
