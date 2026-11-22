import type { CSSProperties } from 'react';
import ContactIconSvg, { type ContactIcon } from '@/components/ContactIcon';
import { whatsappUrl } from '@/lib/public-menu';

// The round icon buttons under the restaurant's name. Only the ones the owner filled in appear. There is no
// "call" button: customers reach the restaurant on WhatsApp. Every link opens in a new tab and sends no referrer.
const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; tiktok: string | null; mapUrl: string | null };

export default function PublicContacts({ phone, instagram, facebook, tiktok, mapUrl }: Contacts) {
  const links: { href: string; label: string; icon: ContactIcon }[] = [];
  if (phone) links.push({ href: whatsappUrl(phone), label: 'واتساب', icon: 'whatsapp' });
  if (instagram) links.push({ href: instagram, label: 'إنستغرام', icon: 'instagram' });
  if (facebook) links.push({ href: facebook, label: 'فيسبوك', icon: 'facebook' });
  if (tiktok) links.push({ href: tiktok, label: 'تيك توك', icon: 'tiktok' });
  if (mapUrl) links.push({ href: mapUrl, label: 'الموقع على الخريطة', icon: 'map' });
  if (links.length === 0) return null;
  return (
    <nav className="pm-contacts" aria-label="التواصل">
      {links.map((l, i) => (
        <a key={l.icon} href={l.href} className="pm-icon" style={{ '--i': i } as CSSProperties} aria-label={l.label} title={l.label} {...external}>
          <ContactIconSvg name={l.icon} />
        </a>
      ))}
    </nav>
  );
}
