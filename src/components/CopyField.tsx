'use client';
import { useState } from 'react';

/** A link shown in full, with a button that copies it (for pasting in Instagram, WhatsApp...). */
export default function CopyField({ label, value }: { label: string; value: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('done');
    } catch {
      setState('failed'); // e.g. an old browser: the link is still visible to copy by hand
    }
    setTimeout(() => setState('idle'), 2000);
  }

  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <input value={value} readOnly dir="ltr" aria-label={label} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn ghost" onClick={copy}>
          {state === 'done' ? 'تم النسخ ✓' : state === 'failed' ? 'تعذّر النسخ' : 'نسخ'}
        </button>
      </div>
    </div>
  );
}
