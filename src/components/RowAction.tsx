'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postJson } from '@/lib/post-json';
import ConfirmDialog from './ConfirmDialog';

/** One small button that calls an endpoint, optionally after a confirmation window of our own. */
export default function RowAction({
  url, body, label, ariaLabel, confirm, confirmLabel, danger = false,
}: {
  url: string; body?: unknown; label: string; ariaLabel?: string;
  confirm?: string; confirmLabel?: string; danger?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');

  async function run() {
    setBusy(true);
    setError('');
    const problem = await postJson(url, body);
    setBusy(false);
    setAsking(false);
    if (problem) return setError(problem);
    router.refresh();
  }

  return (
    <>
      <button
        className={`btn ghost small${danger ? ' danger' : ''}`}
        aria-label={ariaLabel}
        onClick={() => (confirm ? setAsking(true) : run())}
        disabled={busy}
      >
        {label}
      </button>
      {confirm && (
        <ConfirmDialog
          open={asking}
          title="تأكيد الإجراء"
          message={confirm}
          confirmLabel={confirmLabel ?? label}
          danger={danger}
          busy={busy}
          onConfirm={run}
          onCancel={() => setAsking(false)}
        />
      )}
      {error && <span className="error small-text" role="alert">{error}</span>}
    </>
  );
}
