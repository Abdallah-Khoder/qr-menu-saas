'use client';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import { MAX_SIZES } from '@/lib/item-limits';
import { uploadPhoto } from '@/lib/upload-photo';
import { useHydrated } from '@/lib/use-hydrated';

export type Currencies = 'USD' | 'LBP' | 'BOTH';
export type ItemData = {
  id: string; category_id: string; name: string; description: string; available: boolean; image_url: string | null;
  price_usd: string | null; price_lbp: string | null;
  sizes: { label: string; price_usd: string | null; price_lbp: string | null }[];
};
type SizeRow = { label: string; priceUsd: string; priceLbp: string };

const lbpText = (v: string | null) => (v === null ? '' : String(Math.round(Number(v)))); // "450000.00" → "450000"
const usdText = (v: string | null) => v ?? '';

/** Add or edit one item. Only the currencies the restaurant uses are shown. */
export default function ItemForm({
  categories, categoryId, currencies, item, disabled, onDone, onCancel,
}: {
  categories: { id: string; name: string }[]; categoryId: string; currencies: Currencies;
  item?: ItemData; disabled: boolean; onDone: () => void; onCancel: () => void;
}) {
  const showUsd = currencies !== 'LBP';
  const showLbp = currencies !== 'USD';
  const hydrated = useHydrated();
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category_id ?? categoryId);
  const [available, setAvailable] = useState(item?.available ?? true);
  const [priceUsd, setPriceUsd] = useState(usdText(item?.price_usd ?? null));
  const [priceLbp, setPriceLbp] = useState(lbpText(item?.price_lbp ?? null));
  const [withSizes, setWithSizes] = useState((item?.sizes.length ?? 0) > 0);
  const [sizes, setSizes] = useState<SizeRow[]>(
    item?.sizes.map((s) => ({ label: s.label, priceUsd: usdText(s.price_usd), priceLbp: lbpText(s.price_lbp) })) ?? [],
  );
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const emptySize = (): SizeRow => ({ label: '', priceUsd: '', priceLbp: '' });
  function toggleSizes(on: boolean) {
    setWithSizes(on);
    if (on && sizes.length < 2) setSizes([emptySize(), emptySize()]);
  }
  const setSize = (i: number, patch: Partial<SizeRow>) => setSizes((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // so choosing the same file again still works
    if (!file) return;
    setUploading(true);
    setError('');
    const out = await uploadPhoto(file);
    setUploading(false);
    if ('error' in out) return setError(out.error);
    setImageUrl(out.url);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const problem = await postJson(item ? `/api/owner/items/${item.id}/update` : '/api/owner/items', {
      categoryId: category, name, description, available, imageUrl,
      priceUsd: withSizes ? '' : priceUsd, priceLbp: withSizes ? '' : priceLbp,
      sizes: withSizes ? sizes : [],
    });
    setBusy(false);
    if (problem) return setError(problem);
    onDone();
  }

  return (
    <form className="item-form" onSubmit={onSubmit} method="post" action="/api/owner/items">
      <fieldset className="plain" disabled={disabled || busy}>
        <label className="field">
          <span>اسم المنتج</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </label>
        <label className="field">
          <span>وصف المنتج (اختياري)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} rows={2} />
        </label>
        {item && (
          <label className="field">
            <span>القسم</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}

        <div className="field photo-field">
          <span>صورة المنتج (اختيارية)</span>
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- our own small, already-shrunk photo
            <img className="photo-preview" src={imageUrl} alt="" width={96} height={96} referrerPolicy="no-referrer" />
          )}
          <div className="actions">
            <label className={`btn ghost small${uploading ? ' disabled' : ''}`}>
              {uploading ? 'جارٍ رفع الصورة...' : imageUrl ? 'تغيير الصورة' : 'اختيار صورة'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} disabled={uploading || !hydrated} hidden />
            </label>
            {imageUrl && !uploading && (
              <button type="button" className="btn ghost small danger" onClick={() => setImageUrl('')}>إزالة الصورة</button>
            )}
          </div>
        </div>

        <label className="check">
          <input type="checkbox" checked={withSizes} onChange={(e) => toggleSizes(e.target.checked)} />
          منتج بأحجام مختلفة (مثل S وM وL)
        </label>

        {!withSizes ? (
          <div className="form-grid">
            {showUsd && (
              <label className="field">
                <span>السعر بالدولار</span>
                <input dir="ltr" inputMode="decimal" value={priceUsd} onChange={(e) => setPriceUsd(e.target.value)} placeholder="3.50" required />
              </label>
            )}
            {showLbp && (
              <label className="field">
                <span>السعر بالليرة</span>
                <input dir="ltr" inputMode="numeric" value={priceLbp} onChange={(e) => setPriceLbp(e.target.value)} placeholder="150000" required />
              </label>
            )}
          </div>
        ) : (
          <div className="sizes">
            {sizes.map((s, i) => (
              <div className="size-row" key={i}>
                <input dir="ltr" value={s.label} onChange={(e) => setSize(i, { label: e.target.value })} maxLength={6} placeholder="S" aria-label="اسم الحجم" required />
                {showUsd && <input dir="ltr" inputMode="decimal" value={s.priceUsd} onChange={(e) => setSize(i, { priceUsd: e.target.value })} placeholder="$" aria-label="السعر بالدولار" required />}
                {showLbp && <input dir="ltr" inputMode="numeric" value={s.priceLbp} onChange={(e) => setSize(i, { priceLbp: e.target.value })} placeholder="ل.ل" aria-label="السعر بالليرة" required />}
                <button type="button" className="btn ghost small danger" onClick={() => setSizes((rows) => rows.filter((_, j) => j !== i))} aria-label="حذف الحجم">✕</button>
              </div>
            ))}
            <button type="button" className="btn ghost small" disabled={sizes.length >= MAX_SIZES} onClick={() => setSizes((rows) => [...rows, emptySize()])}>
              + إضافة حجم
            </button>
            <p className="note">اسم الحجم حتى 6 أحرف إنجليزية أو أرقام (S, M, L, XL). يلزم حجمان على الأقل.</p>
          </div>
        )}

        <label className="check">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          متوفر حاليًا
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button className="btn" disabled={!hydrated || uploading}>{busy ? 'جارٍ الحفظ...' : 'حفظ'}</button>
          <button type="button" className="btn ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </fieldset>
    </form>
  );
}
