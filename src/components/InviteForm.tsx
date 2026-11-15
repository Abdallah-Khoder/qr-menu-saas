'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';

export default function InviteForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get('email') ?? '');
    setBusy(true);
    setError('');
    setDone('');
    const problem = await postJson('/api/admin/invites', { email });
    setBusy(false);
    if (problem) return setError(problem);
    setDone(`تم إرسال الدعوة إلى ${email}`);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="inline-form">
      <label className="field grow">
        <span>البريد الإلكتروني لصاحب المطعم</span>
        <input name="email" type="email" dir="ltr" required autoComplete="off" />
      </label>
      <button className="btn" disabled={busy}>{busy ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="success" role="status">{done}</p>}
    </form>
  );
}
