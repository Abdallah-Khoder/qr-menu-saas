'use client';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export default function ResetForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password') ?? '');
    if (password !== form.get('confirm')) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.redirect;
        return;
      }
      setError(data.error ?? 'حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.');
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
    }
    setBusy(false);
  }

  // method="post" without a useful action: if JavaScript has not loaded, the browser must not put the
  // password in the address bar. The button stays disabled until the page is ready anyway.
  return (
    <form onSubmit={onSubmit} method="post" action="/api/reset">
      <label className="field">
        <span>البريد الإلكتروني</span>
        <input type="email" dir="ltr" value={email} readOnly />
      </label>
      <label className="field">
        <span>كلمة المرور الجديدة (8 أحرف على الأقل)</span>
        <input name="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={200} required />
      </label>
      <label className="field">
        <span>تأكيد كلمة المرور</span>
        <input name="confirm" type="password" dir="ltr" autoComplete="new-password" minLength={8} maxLength={200} required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الحفظ...' : 'حفظ كلمة المرور'}</button>
    </form>
  );
}
