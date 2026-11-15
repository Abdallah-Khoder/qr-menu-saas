'use client';

export default function LogoutButton() {
  async function logout() {
    await fetch('/api/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    // Full page load on purpose: it makes the browser forget everything from the old session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/login';
  }
  return <button className="btn ghost" onClick={logout}>تسجيل الخروج</button>;
}
