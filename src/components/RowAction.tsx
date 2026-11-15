'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';

/** One small button that calls an admin endpoint, optionally after a confirmation question. */
export default function RowAction({
  url, body, label, confirm, danger = false,
}: { url: string; body?: unknown; label: string; confirm?: string; danger?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setError('');
    const problem = await postJson(url, body);
    setBusy(false);
    if (problem) return setError(problem);
    router.refresh();
  }

  return (
    <>
      <button className={`btn ghost small${danger ? ' danger' : ''}`} onClick={run} disabled={busy}>{label}</button>
      {error && <span className="error small-text" role="alert">{error}</span>}
    </>
  );
}
