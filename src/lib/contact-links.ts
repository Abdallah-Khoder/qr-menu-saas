import { whatsappUrl, type PublicLocation } from './public-menu';

// Every contact link opens in a new tab and sends no referrer.
export const externalLink = { target: '_blank', rel: 'noopener noreferrer' } as const;

export type ContactIconName = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'map';
// A link has an address (`href`), or, for a restaurant with several branches, the list of them (`branches`).
export type ContactLink = { href?: string; branches?: { name: string; href: string }[]; label: string; icon: ContactIconName };
export type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; tiktok: string | null; locations: PublicLocation[] };

/**
 * The contact links of a restaurant, only the ones the owner filled in, in a fixed order. They feed the floating
 * contact button (the only place the icons appear). There is no "call" link: customers reach the restaurant on WhatsApp.
 * The map is ONE icon: with a single branch it opens that map; with several it opens a short list of the branches.
 */
export function contactLinks({ phone, instagram, facebook, tiktok, locations }: Contacts): ContactLink[] {
  const links: ContactLink[] = [];
  if (phone) links.push({ href: whatsappUrl(phone), label: 'واتساب', icon: 'whatsapp' });
  if (instagram) links.push({ href: instagram, label: 'إنستغرام', icon: 'instagram' });
  if (facebook) links.push({ href: facebook, label: 'فيسبوك', icon: 'facebook' });
  if (tiktok) links.push({ href: tiktok, label: 'تيك توك', icon: 'tiktok' });
  if (locations.length === 1) links.push({ href: locations[0].url, label: 'الموقع على الخريطة', icon: 'map' });
  else if (locations.length > 1) links.push({ branches: locations.map((l) => ({ name: l.name, href: l.url })), label: 'الفروع على الخريطة', icon: 'map' });
  return links;
}
