import { Fragment } from 'react';
import { priceParts } from '@/lib/price';

// The price on a public card. Each amount ("$25.00", "2,250,000 ل.ل") is kept in one piece, and the line may
// break only BETWEEN the amounts: on a narrow card the dollars sit on one line and the pounds under them,
// instead of the price running out of the card over its neighbour.
export default function PriceAmounts({ usd, lbp, currencies }: { usd: string | null; lbp: string | null; currencies: 'USD' | 'LBP' | 'BOTH' }) {
  return (
    <>
      {priceParts(usd, lbp, currencies).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          <span className="pm-amt">{part}</span>
        </Fragment>
      ))}
    </>
  );
}
