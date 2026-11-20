import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import PublicPhoto from '@/components/PublicPhoto';
import PublicSizes from '@/components/PublicSizes';
import RefreshOnReturn from '@/components/RefreshOnReturn';
import { getCachedPublicMenu } from '@/lib/public-cache';
import { callUrl, whatsappUrl, type PublicItem } from '@/lib/public-menu';
import { priceText } from '@/lib/price';

// The page a customer opens by scanning the QR code: no login, and the menu is readable without JavaScript (the
// size buttons, the big photo and the refresh when coming back are small extras). The menu comes from the
// cache (one database query only when it is not there yet or was just changed); see public-cache.ts.
const load = cache(getCachedPublicMenu);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await load((await params).slug);
  return {
    // absolute: the customer sees only the restaurant's name in the tab (not "... | منيو QR")
    title: { absolute: result.state === 'ok' ? result.menu.name : result.state === 'missing' ? 'الصفحة غير موجودة' : 'القائمة' },
    robots: { index: false, follow: false }, // the link is meant for the people who scan the code
    referrer: 'no-referrer',
  };
}

function Price({ item, currencies }: { item: PublicItem; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  if (item.sizes.length > 0) return <PublicSizes sizes={item.sizes} currencies={currencies} />;
  return <bdi dir="ltr" className="pm-price">{priceText(item.price_usd, item.price_lbp, currencies)}</bdi>;
}

const external = { target: '_blank', rel: 'noopener noreferrer' } as const;

export default async function PublicMenuPage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await load((await params).slug);
  if (result.state === 'missing') notFound();
  if (result.state === 'unavailable') {
    return (
      <main className="pm">
        <div className="pm-empty"><b>هذه القائمة غير متاحة حاليًا</b>يُرجى المحاولة لاحقًا.</div>
      </main>
    );
  }
  const { menu } = result;
  const contacts: { href: string; label: string; web: boolean }[] = [];
  if (menu.phone) contacts.push({ href: callUrl(menu.phone), label: 'اتصال', web: false }, { href: whatsappUrl(menu.phone), label: 'واتساب', web: true });
  if (menu.mapUrl) contacts.push({ href: menu.mapUrl, label: 'الموقع', web: true });
  if (menu.instagram) contacts.push({ href: menu.instagram, label: 'إنستغرام', web: true });
  if (menu.facebook) contacts.push({ href: menu.facebook, label: 'فيسبوك', web: true });

  return (
    <main className="pm">
      <RefreshOnReturn />
      <header className="pm-head">
        <h1 dir="auto">{menu.name}</h1>
        {contacts.length > 0 && (
          <nav className="pm-contacts" aria-label="التواصل">
            {contacts.map((c) => (
              <a key={c.label} href={c.href} className="pm-btn" {...(c.web ? external : {})}>{c.label}</a>
            ))}
          </nav>
        )}
      </header>

      {menu.categories.length === 0 ? (
        <div className="pm-empty"><b>القائمة قيد التحضير</b>سيتم عرض الأصناف قريبًا.</div>
      ) : (
        <>
          <nav className="pm-tabs" aria-label="الأقسام">
            {menu.categories.map((c, i) => (
              <a key={i} href={`#c${i}`} dir="auto">{c.name}</a>
            ))}
          </nav>
          {menu.categories.map((c, i) => (
            <section key={i} id={`c${i}`} className="pm-cat">
              <h2 dir="auto">{c.name}</h2>
              <ul className="pm-items">
                {c.items.map((item, j) => (
                  <li key={j} className="pm-item">
                    {item.image && <PublicPhoto src={item.image} />}
                    <div className="pm-info">
                      <b dir="auto">{item.name}</b>
                      {item.description && <p dir="auto">{item.description}</p>}
                    </div>
                    <Price item={item} currencies={menu.currencies} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </main>
  );
}
