'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import { formatLbp, formatUsd } from '@/lib/price';
import { useHydrated } from '@/lib/use-hydrated';
import type { MissingPrice, Target } from '@/lib/owner-prices';

export default function FillPrices({ rows, target, disabled = false }: { rows: MissingPrice[]; target: Target; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  const known = (v: string | null) => (v === null ? '' : target === 'LBP' ? formatUsd(v) : formatLbp(v));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const prices = rows
      .map((r, i) => ({ itemId: r.item_id, label: r.label, price: String(f.get(`p${i}`) ?? '').trim() }))
      .filter((p) => p.price !== '');
    setError('');
    setDone('');
    if (prices.length === 0) return setError('اكتب سعرًا واحدًا على الأقل');
    setBusy(true);
    const problem = await postJson('/api/owner/prices', { prices });
    setBusy(false);
    if (problem) return setError(problem);
    setDone(`تم حفظ ${prices.length} سعرًا`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} method="post" action="/api/owner/prices">
      <fieldset className="plain" disabled={disabled}>
        <ul className="rows">
          {rows.map((r, i) => {
            const heading = i === 0 || rows[i - 1].category_name !== r.category_name;
            return (
              <li key={`${r.item_id}-${r.label}`} className="row wrap">
                {heading && <b className="group-title">{r.category_name}</b>}
                <label className="row-main">
                  <span>{r.item_name}{r.label && <> — <bdi dir="ltr">{r.label}</bdi></>}</span>
                  {r.known !== null && <small><bdi dir="ltr">{known(r.known)}</bdi></small>}
                </label>
                <input
                  name={`p${i}`} dir="ltr" inputMode="decimal" autoComplete="off" maxLength={20}
                  className="price-input" placeholder={target === 'LBP' ? '150000' : '3.50'}
                  aria-label={`السعر بـ${target === 'LBP' ? 'الليرة' : 'الدولار'}: ${r.item_name} ${r.label}`.trim()}
                />
              </li>
            );
          })}
        </ul>
        {error && <p className="error" role="alert">{error}</p>}
        {done && <p className="success" role="status">{done}</p>}
        <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الحفظ...' : 'حفظ الأسعار'}</button>
      </fieldset>
    </form>
  );
}
