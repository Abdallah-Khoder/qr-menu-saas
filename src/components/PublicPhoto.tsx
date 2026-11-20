'use client';

import { useRef } from 'react';

// A small photo in the menu list. A tap opens the SAME file (already downloaded, so it opens at once) in a dialog
// over a dark background, at its own size. Closing: the X, a tap outside the photo, or the Escape key.
// The <dialog> element does the focus handling and the Escape key for us.
export default function PublicPhoto({ src }: { src: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="pm-photo-btn" aria-label="عرض الصورة" onClick={() => dialog.current?.showModal()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- already shrunk when uploaded; no extra optimizer */}
        <img className="pm-photo" src={src} alt="" width={84} height={84} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      </button>
      <dialog
        ref={dialog}
        className="pm-viewer"
        aria-label="الصورة"
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}
      >
        <button type="button" className="pm-viewer-x" aria-label="إغلاق" onClick={() => dialog.current?.close()}>×</button>
        {/* lazy: the browser only loads it when the dialog is shown (and it is the same file as the small one) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
      </dialog>
    </>
  );
}
