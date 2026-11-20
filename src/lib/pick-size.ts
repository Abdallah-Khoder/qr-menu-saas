/**
 * Which size is on show. The customer's choice is kept by the size NAME (unique inside an item), not by its place
 * in the list: after a refresh where the owner removed another size, the customer keeps what he chose. If the chosen
 * size is gone (or nothing was chosen yet), the first size is shown.
 */
export function pickSize<T extends { label: string }>(sizes: T[], chosen: string | null): T {
  return sizes.find((s) => s.label === chosen) ?? sizes[0];
}
