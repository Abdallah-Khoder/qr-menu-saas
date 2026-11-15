import { useSyncExternalStore } from 'react';

/**
 * false while the page is still plain HTML from the server, true once JavaScript has taken over.
 * Forms use it to keep their button disabled until their code is ready, so nobody can submit
 * a form that the browser would then send the old (non-JSON) way.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true, // in the browser, after hydration
    () => false, // on the server and during hydration
  );
}
