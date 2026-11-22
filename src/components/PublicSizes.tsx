'use client';

import { useState } from 'react';
import { pickSize } from '@/lib/pick-size';
import PriceAmounts from '@/components/PriceAmounts';
import type { PublicSize } from '@/lib/public-menu';

// An item with sizes: ONE price on show (the first size, in the order the owner set), and a button per size.
// Choosing a size changes the price shown. Nothing is sent anywhere: it only changes what the customer reads.
export default function PublicSizes({ sizes, currencies }: { sizes: PublicSize[]; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  const [chosen, setChosen] = useState<string | null>(null); // the NAME of the size (see pickSize)
  const size = pickSize(sizes, chosen);
  return (
    <div className="pm-sized">
      <div key={size.label} className={chosen === null ? 'pm-price' : 'pm-price pm-price-swap'} aria-live="polite"><PriceAmounts usd={size.price_usd} lbp={size.price_lbp} currencies={currencies} /></div>
      <div className="pm-size-btns" role="group" aria-label="الحجم">
        {sizes.map((s) => (
          <button key={s.label} type="button" className="pm-size-btn" aria-pressed={s === size} onClick={() => setChosen(s.label)}>
            <bdi dir="ltr">{s.label}</bdi>
          </button>
        ))}
      </div>
    </div>
  );
}
