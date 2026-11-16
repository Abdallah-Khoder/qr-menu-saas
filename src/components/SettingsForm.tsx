'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import { useHydrated } from '@/lib/use-hydrated';

type R = {
  name: string; currencies: 'USD' | 'LBP' | 'BOTH'; phone_number: string | null; map_url: string | null;
  instagram_url: string | null; facebook_url: string | null;
};

export default function SettingsForm({ restaurant, disabled = false }: { restaurant: R; disabled?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const text = (k: string) => String(f.get(k) ?? '');
    setBusy(true);
    setError('');
    setDone('');
    const problem = await postJson('/api/owner/settings', {
      name: text('name'), currencies: text('currencies'), phone: text('phone'),
      mapUrl: text('mapUrl'), instagram: text('instagram'), facebook: text('facebook'),
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

      <div className="form-grid">
        <label className="field">
          <span>رقم الهاتف (للاتصال والواتساب)</span>
          <input name="phone" dir="ltr" defaultValue={restaurant.phone_number ?? ''} placeholder="+96170123456" inputMode="tel" />
        </label>
        <label className="field">
          <span>رابط الموقع على الخريطة</span>
          <input name="mapUrl" dir="ltr" defaultValue={restaurant.map_url ?? ''} placeholder="https://maps.app.goo.gl/..." />
        </label>
        <label className="field">
          <span>إنستغرام (اختياري)</span>
          <input name="instagram" dir="ltr" defaultValue={restaurant.instagram_url ?? ''} placeholder="@اسم_الحساب أو الرابط" />
        </label>
        <label className="field">
          <span>فيسبوك (اختياري)</span>
          <input name="facebook" dir="ltr" defaultValue={restaurant.facebook_url ?? ''} placeholder="اسم الصفحة أو الرابط" />
        </label>
      </div>
      <p className="note">اترك أي خانة فارغة إذا لا تريدها، وتظهر للزبائن الأزرار التي عبّأتها فقط.</p>

      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="success" role="status">{done}</p>}
      <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الحفظ...' : 'حفظ الإعدادات'}</button>
      </fieldset>
    </form>
  );
}
