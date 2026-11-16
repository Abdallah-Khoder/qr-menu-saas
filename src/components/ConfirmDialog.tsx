'use client';
import { useEffect, useRef } from 'react';

/**
 * Our own confirmation window (instead of the browser's plain "OK / Cancel" box).
 * Uses the browser's <dialog> element: Esc closes it, focus stays inside, the page behind is blocked.
 */
export default function ConfirmDialog({
  open, title, message, confirmLabel, danger = false, busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="confirm"
      aria-labelledby="confirm-title"
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel(); }} // Esc key
      onClick={(e) => { if (e.target === ref.current && !busy) onCancel(); }} // click on the dark area
    >
      <h2 id="confirm-title">{title}</h2>
      <p>{message}</p>
      <div className="confirm-actions">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>إلغاء</button>
        <button type="button" className={`btn${danger ? ' danger-solid' : ''}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'جارٍ التنفيذ...' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
