'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { priceText } from '@/lib/price';
import ItemForm, { type Currencies, type ItemData } from './ItemForm';
import RowAction from './RowAction';

export default function ItemRow({
  item, categories, currencies, first, last, disabled,
}: {
  item: ItemData; categories: { id: string; name: string }[]; currencies: Currencies;
  first: boolean; last: boolean; disabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const url = `/api/owner/items/${item.id}`;

  if (editing) {
    return (
      <li className="row wrap">
        <ItemForm
          categories={categories} categoryId={item.category_id} currencies={currencies} item={item} disabled={disabled}
          onCancel={() => setEditing(false)} onDone={() => { setEditing(false); router.refresh(); }}
        />
      </li>
    );
  }

  return (
    <li className={`row wrap${item.available ? '' : ' muted'}`}>
      {item.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- our own small, already-shrunk photo
        <img className="row-photo" src={item.image_url} alt="" width={48} height={48} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      )}
      <div className="row-main">
        <b>{item.name}</b> {!item.available && <span className="badge">غير متوفر</span>}
        {item.description && <small>{item.description}</small>}
        {item.sizes.length === 0 ? (
          <small><bdi dir="ltr">{priceText(item.price_usd, item.price_lbp, currencies)}</bdi></small>
        ) : (
          <small className="size-list">
            {item.sizes.map((s) => (
              <bdi dir="ltr" key={s.label}>{s.label}: {priceText(s.price_usd, s.price_lbp, currencies)}</bdi>
            ))}
          </small>
        )}
      </div>
      <div className="actions">
        {!first && <RowAction url={`${url}/move`} body={{ direction: 'up' }} label="↑" ariaLabel="تحريك إلى الأعلى" disabled={disabled} />}
        {!last && <RowAction url={`${url}/move`} body={{ direction: 'down' }} label="↓" ariaLabel="تحريك إلى الأسفل" disabled={disabled} />}
        <RowAction url={`${url}/available`} body={{ available: !item.available }} label={item.available ? 'إخفاء' : 'إظهار'} disabled={disabled} />
        <button className="btn ghost small" disabled={disabled} onClick={() => setEditing(true)}>تعديل</button>
        <RowAction
          url={`${url}/delete`} label="حذف" danger disabled={disabled} confirmLabel="نعم، احذف"
          confirm={`سيُحذف المنتج «${item.name}»${item.sizes.length ? ' مع أحجامه' : ''}. لا يمكن التراجع.`}
        />
      </div>
    </li>
  );
}
