'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import { useHydrated } from '@/lib/use-hydrated';

export default function CategoryForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const hydrated = useHydrated();

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError('');
    const problem = await postJson('/api/owner/categories', { name: String(new FormData(form).get('name') ?? '') });
    setBusy(false);
    if (problem) return setError(problem);
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} method="post" action="/api/owner/categories" className="inline-form">
      <label className="field grow">
        <span>اسم القسم</span>
        <input name="name" maxLength={80} required autoComplete="off" />
      </label>
      <button className="btn" disabled={busy || !hydrated}>{busy ? 'جارٍ الإضافة...' : 'إضافة'}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
