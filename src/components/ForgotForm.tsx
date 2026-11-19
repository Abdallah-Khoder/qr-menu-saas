'use client';
import { useState } from 'react';
import { useHydrated } from '@/lib/use-hydrated';

export default function ForgotForm() {
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email') }),
      });
      const data = await res.json();
      if (res.ok) {
        setSent(true);
        return;
      }
      setError(data.error ?? 'حدث خطأ غير متوقع. يُرجى المحاولة مرة أخرى.');
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقّق من اتصالك بالإنترنت.');
    }
    setBusy(false);
  }

  // The answer is the same whether or not the email has an account (so nobody can use this to find out).
  if (sent) {
    return (
      <p className="note success" role="status">
        إذا كان هذا البريد الإلكتروني مسجّلًا لدينا، فقد أرسلنا إليه رابطًا لاختيار كلمة مرور جديدة.
        الرابط صالح لمدة 20 دقيقة ويُستعمل مرة واحدة. تحقّق أيضًا من مجلد الرسائل غير المرغوب فيها.
      </p>
    );
  }
  return (
    <form onSubmit={onSubmit} method="post" action="/api/forgot">
      <label className="field">
        <span>البريد الإلكتروني</span>
        <input name="email" type="email" dir="ltr" autoComplete="username" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الإرسال...' : 'إرسال الرابط'}</button>
    </form>
  );
}
