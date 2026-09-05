/**
 * Chart color system. The categorical order is fixed — series take colors in
 * this sequence and never cycle or reshuffle when a filter changes the count.
 *
 * Validated with the dataviz palette checker (lightness band, chroma floor,
 * CVD separation, normal-vision floor, contrast vs #FFFFFF): the four-slot
 * order green → blue → clay → plum passes all checks. Green must never sit
 * adjacent to clay/orange (protan ΔE collapses to ~1); the interleave below
 * is what makes the set safe.
 */
export const CHART = {
  green: "#059669",
  blue: "#2563EB",
  clay: "#EA580C",
  plum: "#7C3AED",
  /** Neutral midpoint for diverging series (e.g. a "Base" scenario). */
  neutral: "#94A3B8",
  /** Recessive grid lines. */
  grid: "#F1F5F9",
  /** Axis / legend text. */
  axisInk: "#64748B",
  ink: "#0F172A",
  line: "#E2E8F0",
} as const;

export const CATEGORICAL: string[] = [CHART.green, CHART.blue, CHART.clay, CHART.plum];

/** Compact peso for axis ticks: ₱1.2M / ₱45k / ₱850. */
export function compactPeso(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}₱${(a / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1_000) return `${sign}₱${(a / 1_000).toFixed(0)}k`;
  return `${sign}₱${a.toFixed(0)}`;
}
