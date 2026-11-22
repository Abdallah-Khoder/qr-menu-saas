import type { CSSProperties } from 'react';
import ContactIconSvg from '@/components/ContactIcon';
import { contactLinks, type Contacts } from '@/lib/contact-links';

// The round icon buttons under the restaurant's name. Only the ones the owner filled in appear. Every link opens in a
// new tab and sends no referrer.
export const externalLink = { target: '_blank', rel: 'noopener noreferrer' } as const;

export default function PublicContacts(contacts: Contacts) {
  const links = contactLinks(contacts);
  if (links.length === 0) return null;
  return (
    <nav className="pm-contacts" aria-label="التواصل">
      {links.map((l, i) => (
        <a key={l.icon} href={l.href} className="pm-icon" style={{ '--i': i } as CSSProperties} aria-label={l.label} title={l.label} {...externalLink}>
          <ContactIconSvg name={l.icon} />
        </a>
      ))}
    </nav>
  );
}
