import { priceParts } from '@/lib/price';

// The price on a public card: each amount ("$25.00", "2,250,000 ل.ل") is its own piece. The first one is the main
// price (bigger, in the menu colour) and the second is the smaller grey one; the CSS puts them at the two ends of
// one row, and on a narrow card the second drops under the first, so the price never runs out of the card.
// Each amount is left-to-right on its own (so "$25.00" and the digits keep their order inside the right-to-left page).
export default function PriceAmounts({ usd, lbp, currencies }: { usd: string | null; lbp: string | null; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  return (
    <>
      {priceParts(usd, lbp, currencies).map((part, i) => (
        <bdi key={i} dir="ltr" className="pm-amt">{part}</bdi>
      ))}
    </>
  );
}
