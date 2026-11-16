/** "5.50" → "$5.50" */
export function formatUsd(value: string): string {
  return `$${Number(value).toFixed(2)}`;
}

/** "450000.00" → "450,000 ل.ل" (Latin digits, comma every 3 digits). */
export function formatLbp(value: string): string {
  return `${Math.round(Number(value)).toLocaleString('en-US')} ل.ل`;
}

/** The price line of an item or size, only in the currencies the restaurant uses. */
export function priceText(usd: string | null, lbp: string | null, currencies: 'USD' | 'LBP' | 'BOTH'): string {
  const parts: string[] = [];
  if (currencies !== 'LBP' && usd !== null) parts.push(formatUsd(usd));
  if (currencies !== 'USD' && lbp !== null) parts.push(formatLbp(lbp));
  return parts.join(' · ');
}
