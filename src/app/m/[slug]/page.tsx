import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getDb } from '@/lib/db';
import { callUrl, getPublicMenu, whatsappUrl, type PublicItem } from '@/lib/public-menu';
import { priceText } from '@/lib/price';

// The page a customer opens by scanning the QR code: no login, no JavaScript needed, one database query.
const load = cache((slug: string) => getPublicMenu(getDb(), slug));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await load((await params).slug);
  return {
    title: result.state === 'ok' ? result.menu.name : 'القائمة',
    robots: { index: false, follow: false }, // the link is meant for the people who scan the code
    referrer: 'no-referrer',
  };
}

function Price({ item, currencies }: { item: PublicItem; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  if (item.sizes.length === 0) {
    return <bdi dir="ltr" className="pm-price">{priceText(item.price_usd, item.price_lbp, currencies)}</bdi>;
  }
  return (
    <ul className="pm-sizes">
      {item.sizes.map((s) => (
        <li key={s.label}>
          <bdi dir="ltr" className="pm-size">{s.label}</bdi>
          <bdi dir="ltr" className="pm-price">{priceText(s.price_usd, s.price_lbp, currencies)}</bdi>
        </li>
      ))}
    </ul>
  );
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
