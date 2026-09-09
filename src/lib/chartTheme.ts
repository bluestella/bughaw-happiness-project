/**
 * Chart color system, built on the Bughaw brand palette (docs/index.html).
 * The categorical order is fixed — series take colors in this sequence and
 * never cycle or reshuffle when a filter changes the count. Purple is off the
 * palette entirely (brand rule), so the 4th categorical slot is gold instead
 * of plum — used only for marks/bars here, never as running text.
 */
export const CHART = {
  green: "#4C8B32",
  blue: "#20699F",
  clay: "#6E5A42",
  gold: "#E5B95F",
  /** Neutral midpoint for diverging series (e.g. a "Base" scenario). */
  neutral: "#A39B87",
  /** Recessive grid lines. */
  grid: "#EDE8D6",
  /** Axis / legend text. */
  axisInk: "#6B6355",
  ink: "#241F1A",
  line: "#DDD6C0",
} as const;

export const CATEGORICAL: string[] = [CHART.green, CHART.blue, CHART.clay, CHART.gold];

/** Compact peso for axis ticks: ₱1.2M / ₱45k / ₱850. */
export function compactPeso(v: number): string {
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}₱${(a / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (a >= 1_000) return `${sign}₱${(a / 1_000).toFixed(0)}k`;
  return `${sign}₱${a.toFixed(0)}`;
}
