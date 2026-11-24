'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import BranchesList from '@/components/BranchesList';
import ContactIconSvg from '@/components/ContactIcon';
import { externalLink, type ContactLink } from '@/lib/contact-links';

// Floating buttons on the public menu:
//  - the contact links, there from the first moment (nothing to scroll for). On a phone or tablet they are ONE round
//    button that opens the icons upwards (a column of five would sit on top of the dishes); on a wide screen (CSS,
//    >= 1200px) the column is always open at the side of the page, where there is empty room;
//  - a "back to top" arrow, shown only once the person has scrolled (the sections bar is no longer fixed, so this is
//    the way back to it).
const SHOW_AFTER = 300; // px scrolled

export default function FloatingContacts({ links }: { links: ContactLink[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [branchesOpen, setBranchesOpen] = useState(false); // the list of branches (only when there are several)
  const box = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const branchesBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_AFTER);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true }); // passive: never slows the scrolling
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open && !branchesOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) { setOpen(false); setBranchesOpen(false); } // a tap anywhere else closes it
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (branchesOpen) { setBranchesOpen(false); branchesBtn.current?.focus(); return; } // the list first, then the column
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, branchesOpen]);

  function toTop() {
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: calm ? 'instant' : 'smooth' });
  }

  return (
    <>
      {links.length > 0 && (
        <div ref={box} className="pm-float" data-open={open} style={{ '--n': links.length } as CSSProperties}>
          <div className="pm-float-links" id="pm-float-links">
            {links.map((l, i) =>
              l.branches ? (
                <div key={l.icon} className="pm-branch-wrap">
                  <button
                    ref={branchesBtn}
                    type="button"
                    className="pm-icon pm-float-icon"
                    style={{ '--i': i } as CSSProperties}
                    aria-label={l.label}
                    title={l.label}
                    aria-expanded={branchesOpen}
                    aria-controls="pm-branches"
                    onClick={() => setBranchesOpen(!branchesOpen)}
                  >
                    <ContactIconSvg name={l.icon} />
                  </button>
                  {branchesOpen && <BranchesList label={l.label} branches={l.branches} />}
                </div>
              ) : (
                <a key={l.icon} href={l.href} className="pm-icon pm-float-icon" style={{ '--i': i } as CSSProperties} aria-label={l.label} title={l.label} {...externalLink}>
                  <ContactIconSvg name={l.icon} />
                </a>
              ),
            )}
          </div>
          <button
            ref={toggle}
            type="button"
            className="pm-float-toggle"
            aria-expanded={open}
            aria-controls="pm-float-links"
            aria-label={open ? 'إغلاق' : 'التواصل مع المطعم'}
            onClick={() => { setOpen(!open); setBranchesOpen(false); }} // closing the column closes the list too
          >
            <ContactIconSvg name={open ? 'close' : 'chat'} />
          </button>
        </div>
      )}
      <button type="button" className="pm-top" data-show={scrolled} aria-label="العودة إلى أعلى الصفحة" title="العودة إلى أعلى الصفحة" onClick={toTop}>
        <ContactIconSvg name="up" />
      </button>
    </>
  );
}
