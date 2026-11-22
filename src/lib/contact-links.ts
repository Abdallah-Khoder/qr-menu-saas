import { whatsappUrl } from './public-menu';

export type ContactIconName = 'whatsapp' | 'instagram' | 'facebook' | 'tiktok' | 'map';
export type ContactLink = { href: string; label: string; icon: ContactIconName };
export type Contacts = { phone: string | null; instagram: string | null; facebook: string | null; tiktok: string | null; mapUrl: string | null };

/**
 * The contact links of a restaurant, only the ones the owner filled in, in a fixed order. One list feeds both the
 * round icons under the name and the floating buttons, so they can never disagree. There is no "call" link:
 * customers reach the restaurant on WhatsApp.
 */
export function contactLinks({ phone, instagram, facebook, tiktok, mapUrl }: Contacts): ContactLink[] {
  const links: ContactLink[] = [];
  if (phone) links.push({ href: whatsappUrl(phone), label: 'واتساب', icon: 'whatsapp' });
  if (instagram) links.push({ href: instagram, label: 'إنستغرام', icon: 'instagram' });
  if (facebook) links.push({ href: facebook, label: 'فيسبوك', icon: 'facebook' });
  if (tiktok) links.push({ href: tiktok, label: 'تيك توك', icon: 'tiktok' });
  if (mapUrl) links.push({ href: mapUrl, label: 'الموقع على الخريطة', icon: 'map' });
  return links;
}
