// Volume price tiers — pure helpers shared by the Volume Pricing calculator and
// (later) the quotation builder (docs/specs/sales-quotes-orders-stock.md).

export type PriceTier = { minQty: number; unitPrice: number };

/** A tier counts only when it has a positive minimum quantity and a positive price. */
const isUsable = (t: PriceTier) =>
  Number.isFinite(t.minQty) && Number.isFinite(t.unitPrice) && t.minQty > 0 && t.unitPrice > 0;

/** Usable tiers, lowest minimum quantity first. Does not change the input. */
export function sortedTiers(tiers: PriceTier[]): PriceTier[] {
  return tiers.filter(isUsable).sort((a, b) => a.minQty - b.minQty);
}

/**
 * The tier that applies to `qty`: the one with the highest `minQty` not above it.
 * Returns null when no tier applies (quantity below every minimum, no usable
 * tiers, or a quantity that is not a positive number).
 */
export function priceForQty(
  tiers: PriceTier[],
  qty: number,
): { index: number; tier: PriceTier } | null {
  if (!Number.isFinite(qty) || qty <= 0) return null;
  const sorted = sortedTiers(tiers);
  let found = -1;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].minQty <= qty) found = i;
  return found < 0 ? null : { index: found, tier: sorted[found] };
}

/** Extra units needed to reach the next price tier; 0 when already at the top or no tier applies. */
export function unitsToNextTier(tiers: PriceTier[], qty: number): number {
  const have = Number.isFinite(qty) ? Math.max(0, qty) : 0;
  const next = sortedTiers(tiers).find((t) => t.minQty > have);
  return next ? Math.ceil(next.minQty - have) : 0;
}
