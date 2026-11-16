'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import RowAction from './RowAction';

type Category = { id: string; name: string; item_count: number };

export default function CategoryRow({ category, first, last }: { category: Category; first: boolean; last: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(category.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const url = `/api/owner/categories/${category.id}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const problem = await postJson(`${url}/rename`, { name });
    setBusy(false);
    if (problem) return setError(problem);
    setEditing(false);
    router.refresh();
  }

  const warning = category.item_count > 0
    ? `سيُحذف القسم «${category.name}» مع ${category.item_count} صنف بداخله. لا يمكن التراجع.`
    : `سيُحذف القسم «${category.name}». لا يمكن التراجع.`;

  return (
    <li className="row wrap">
      {editing ? (
        <form className="cat-edit" onSubmit={save}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required aria-label="اسم القسم" disabled={busy} />
          <button className="btn small" disabled={busy}>حفظ</button>
          <button type="button" className="btn ghost small" disabled={busy} onClick={() => { setEditing(false); setError(''); }}>إلغاء</button>
        </form>
      ) : (
        <div className="row-main">
          <b>{category.name}</b>
          <small>{category.item_count} صنف</small>
        </div>
      )}
      {!editing && (
        <div className="actions">
          {!first && <RowAction url={`${url}/move`} body={{ direction: 'up' }} label="↑" ariaLabel="تحريك إلى الأعلى" />}
          {!last && <RowAction url={`${url}/move`} body={{ direction: 'down' }} label="↓" ariaLabel="تحريك إلى الأسفل" />}
          <button className="btn ghost small" onClick={() => { setName(category.name); setEditing(true); }}>تعديل الاسم</button>
          <RowAction url={`${url}/delete`} label="حذف" confirm={warning} confirmLabel="نعم، احذف" danger />
        </div>
      )}
      {error && <span className="error small-text" role="alert">{error}</span>}
    </li>
  );
}
