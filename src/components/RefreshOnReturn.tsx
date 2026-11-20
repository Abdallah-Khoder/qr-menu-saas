'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const MIN_GAP_MS = 10_000;

// A page that stays open does not know the owner changed the menu. When the customer comes BACK to it (switches back
// to the tab, unlocks the phone, or returns with the Back button) it asks for the fresh menu once. There is no timer:
// a page nobody is looking at asks for nothing, so the database and the server are not loaded for nothing.
export default function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return; // coming back and forth quickly asks only once (the Back button too)
      last = now;
      router.refresh();
    };
    const onVisible = () => refresh();
    const onShow = (e: PageTransitionEvent) => { if (e.persisted) refresh(); }; // restored by the Back button
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onShow);
    };
  }, [router]);
  return null;
}
