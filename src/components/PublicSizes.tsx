'use client';

import { useState } from 'react';
import { priceText } from '@/lib/price';
import type { PublicSize } from '@/lib/public-menu';

// An item with sizes: ONE price on show (the first size, in the order the owner set), and a button per size.
// Choosing a size changes the price shown. Nothing is sent anywhere: it only changes what the customer reads.
export default function PublicSizes({ sizes, currencies }: { sizes: PublicSize[]; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  const [chosen, setChosen] = useState(0);
  const size = sizes[chosen] ?? sizes[0]; // the list can change after a refresh: never point outside it
  return (
    <div className="pm-sized">
      <bdi dir="ltr" className="pm-price" aria-live="polite">{priceText(size.price_usd, size.price_lbp, currencies)}</bdi>
      <div className="pm-size-btns" role="group" aria-label="الحجم">
        {sizes.map((s, i) => (
          <button key={i} type="button" className="pm-size-btn" aria-pressed={s === size} onClick={() => setChosen(i)}>
            <bdi dir="ltr">{s.label}</bdi>
          </button>
        ))}
      </div>
    </div>
  );
}
