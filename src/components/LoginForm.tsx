'use client';
import { useState } from 'react';

export default function LoginForm() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = data.redirect; // full reload so the new cookie is used
        return;
      }
      setError(data.error ?? 'صار خطأ، جرّب مرة ثانية');
    } catch {
      setError('ما في اتصال بالإنترنت');
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit}>
      <label className="field">
        <span>الإيميل</span>
        <input name="email" type="email" dir="ltr" autoComplete="username" required />
      </label>
      <label className="field">
        <span>كلمة السر</span>
        <input name="password" type="password" dir="ltr" autoComplete="current-password" required />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={busy}>{busy ? 'لحظة...' : 'دخول'}</button>
    </form>
  );
}
