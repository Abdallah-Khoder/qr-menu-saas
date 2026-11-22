'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import ContactIconSvg from '@/components/ContactIcon';
import { externalLink } from '@/components/PublicContacts';
import type { ContactLink } from '@/lib/contact-links';

// Floating buttons on the public menu, shown once the person has scrolled past the header (the icons under the name are
// still on screen before that):
//  - a "back to top" arrow (the sections bar is no longer fixed, so this is the way back to it);
//  - the contact links. On a phone or tablet they are ONE round button that opens the icons upwards (a column of five
//    would sit on top of the dishes); on a wide screen (CSS, >= 1200px) the column is always open at the side of the
//    page, where there is empty room.
const SHOW_AFTER = 300; // px scrolled

export default function FloatingContacts({ links }: { links: ContactLink[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const expanded = open && scrolled;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true }); // passive: never slows the scrolling
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false); // a tap anywhere else closes it
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toTop() {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'instant' : 'smooth' });
  }

  return (
    <>
      {links.length > 0 && (
        <div ref={box} className="pm-float" data-show={scrolled} data-open={expanded} style={{ '--n': links.length } as CSSProperties}>
          <div className="pm-float-links" id="pm-float-links">
            {links.map((l, i) => (
              <a key={l.icon} href={l.href} className="pm-icon pm-float-icon" style={{ '--i': i } as CSSProperties} aria-label={l.label} title={l.label} {...externalLink}>
                <ContactIconSvg name={l.icon} />
              </a>
            ))}
          </div>
          <button
            ref={toggle}
            type="button"
            className="pm-float-toggle"
            aria-expanded={expanded}
            aria-controls="pm-float-links"
            aria-label={expanded ? 'إغلاق' : 'التواصل مع المطعم'}
            onClick={() => setOpen(!open)}
          >
            <ContactIconSvg name={expanded ? 'close' : 'chat'} />
          </button>
        </div>
      )}
      <button type="button" className="pm-top" data-show={scrolled} aria-label="العودة إلى أعلى الصفحة" title="العودة إلى أعلى الصفحة" onClick={toTop}>
        <ContactIconSvg name="up" />
      </button>
    </>
  );
}
