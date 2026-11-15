'use client';
import { useState } from 'react';

export default function LogoutButton() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      if (res.ok) {
        // Full page load on purpose: it makes the browser forget everything from the old session.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/login';
        return;
      }
    } catch {
      // network failure: handled below, same as an error answer
    }
    // We only leave the page after a SUCCESSFUL answer, otherwise the cookie would still be there.
    setError('ما زبطت، جرّب مرة ثانية');
    setBusy(false);
  }

  return (
    <>
      <button className="btn ghost" onClick={logout} disabled={busy}>تسجيل الخروج</button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
