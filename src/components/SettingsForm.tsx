'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { MAX_LOCATIONS } from '@/lib/locations';
import { postJson } from '@/lib/post-json';
import { useHydrated } from '@/lib/use-hydrated';

type R = {
  name: string; currencies: 'USD' | 'LBP' | 'BOTH'; phone_number: string | null;
  instagram_url: string | null; facebook_url: string | null; tiktok_url: string | null; menu_direction: 'rtl' | 'ltr';
  locations: { name: string; map_url: string }[];
};
type Row = { id: number; name: string; url: string }; // one branch being edited (id: only to keep the rows apart)

export default function SettingsForm({ restaurant, disabled = false }: { restaurant: R; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();
  const [rows, setRows] = useState<Row[]>(() => restaurant.locations.map((l, i) => ({ id: i, name: l.name, url: l.map_url })));
  const nextId = useRef(restaurant.locations.length);
  const setRow = (id: number, change: Partial<Row>) => setRows((all) => all.map((r) => (r.id === id ? { ...r, ...change } : r)));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '');
    setBusy(true);
    setError('');
    setDone('');
    const problem = await postJson('/api/owner/settings', {
      name: text('name'), currencies: text('currencies'), phone: text('phone'),
      instagram: text('instagram'), facebook: text('facebook'), tiktok: text('tiktok'),
      direction: text('direction'),
      locations: rows.map((r) => ({ name: r.name, mapUrl: r.url })),
    });
    setBusy(false);
    if (problem) return setError(problem);
    setDone('تم حفظ الإعدادات');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} method="post" action="/api/owner/settings">
      <fieldset className="plain" disabled={disabled}>
      <label className="field">
        <span>اسم المطعم</span>
        <input name="name" defaultValue={restaurant.name} maxLength={80} required />
      </label>
      <p className="note">تغيير الاسم لا يغيّر رابط قائمتك، فتبقى الرموز المطبوعة صالحة.</p>

      <fieldset className="choice">
        <legend>عملة الأسعار في القائمة</legend>
        {([['USD', 'الدولار'], ['LBP', 'الليرة اللبنانية'], ['BOTH', 'الدولار والليرة معًا']] as const).map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="currencies" value={value} defaultChecked={restaurant.currencies === value} />
            {label}
          </label>
        ))}
      </fieldset>

      <fieldset className="choice">
        <legend>اتجاه القائمة</legend>
        {([['rtl', 'من اليمين إلى اليسار (للعربية)'], ['ltr', 'من اليسار إلى اليمين (للإنكليزية)']] as const).map(([value, label]) => (
          <label key={value}>
            <input type="radio" name="direction" value={value} defaultChecked={restaurant.menu_direction === value} />
            {label}
          </label>
        ))}
      </fieldset>
      <p className="note">يحدّد هذا مكان الأسماء والأسعار والأزرار في الصفحة التي يراها زبائنك.</p>

      <div className="form-grid">
        <label className="field">
          <span>رقم الواتساب</span>
          <input name="phone" dir="ltr" defaultValue={restaurant.phone_number ?? ''} placeholder="+96170123456" inputMode="tel" />
        </label>
        <label className="field">
          <span>إنستغرام (اختياري)</span>
          <input name="instagram" dir="ltr" defaultValue={restaurant.instagram_url ?? ''} placeholder="@اسم_الحساب أو الرابط" />
        </label>
        <label className="field">
          <span>فيسبوك (اختياري)</span>
          <input name="facebook" dir="ltr" defaultValue={restaurant.facebook_url ?? ''} placeholder="اسم الصفحة أو الرابط" />
        </label>
        <label className="field">
          <span>تيك توك (اختياري)</span>
          <input name="tiktok" dir="ltr" defaultValue={restaurant.tiktok_url ?? ''} placeholder="@اسم_الحساب أو الرابط" />
        </label>
      </div>
      <p className="note">اترك أي خانة فارغة إذا لا تريدها، وتظهر للزبائن الأيقونات التي عبّأتها فقط.</p>

      <fieldset className="branches">
        <legend>الفروع والموقع على الخريطة</legend>
        {rows.length === 0 && <p className="note">لم تضف أي فرع بعد. أضف فرعًا ليظهر موقع مطعمك على الخريطة لزبائنك.</p>}
        {rows.map((r, i) => (
          <div className="branch-row" key={r.id}>
            <label className="field">
              <span>اسم الفرع{rows.length > 1 ? ` (${i + 1})` : ''}</span>
              <input value={r.name} onChange={(e) => setRow(r.id, { name: e.target.value })} maxLength={80} placeholder="مثال: فرع الحمرا" />
            </label>
            <label className="field">
              <span>رابط الخريطة</span>
              <input value={r.url} onChange={(e) => setRow(r.id, { url: e.target.value })} dir="ltr" placeholder="https://maps.app.goo.gl/..." />
            </label>
            <button type="button" className="btn ghost" aria-label={`حذف الفرع ${i + 1}`} onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}>
              حذف
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn ghost"
          disabled={rows.length >= MAX_LOCATIONS}
          onClick={() => setRows((all) => [...all, { id: nextId.current++, name: '', url: '' }])}
        >
          + إضافة فرع
        </button>
        <p className="note">يمكنك إضافة حتى {MAX_LOCATIONS} فرعًا. إذا كان لمطعمك فرع واحد فتفتح الخريطة مباشرة، وإذا كان أكثر فيختار الزبون الفرع من قائمة صغيرة.</p>
        <p className="note">لإضافة موقع الفرع: افتح «خرائط Google» وابحث عن الفرع، ثم اضغط «مشاركة» و«نسخ الرابط»، والصق الرابط في خانة الخريطة. وإذا تركت الفرع فارغًا فلن يُحفظ.</p>
      </fieldset>

      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="success" role="status">{done}</p>}
      <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button>
      </fieldset>
    </form>
  );
}
