'use client';
import { useSyncExternalStore } from 'react';
import { isPreviewSearch } from '@/lib/preview';

// A bar at the top of the public menu for its OWNER, who opened it from the dashboard: it leads back to the dashboard.
// The server never draws it (a customer's page is exactly the cached page); the browser adds it after it reads the
// address. It always reads right to left: it is the owner's tool, not part of the menu, whatever direction the menu has.
export function PreviewBarView() {
  return (
    <div className="pm-preview" dir="rtl" role="region" aria-label="معاينة القائمة">
      <a href="/dashboard">→ العودة إلى لوحة التحكم</a>
      <span>هذه معاينة لقائمتك كما يراها الزبائن</span>
    </div>
  );
}

const subscribe = (notify: () => void) => {
  window.addEventListener('popstate', notify);
  return () => window.removeEventListener('popstate', notify);
};

export default function PreviewBar() {
  const preview = useSyncExternalStore(subscribe, () => isPreviewSearch(window.location.search), () => false);
  return preview ? <PreviewBarView /> : null;
}
