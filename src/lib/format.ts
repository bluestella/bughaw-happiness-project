export type OutputFormat = "currency" | "percentage" | "number" | "ratio" | "months";

export function peso(n: number | null | undefined, decimals = 2): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return (
    "₱" +
    n.toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function pesoRound(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "₱" + Math.abs(Math.round(n)).toLocaleString("en-PH");
}

export function formatValue(format: OutputFormat, v: number | null | undefined): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  switch (format) {
    case "currency":
      return pesoRound(v);
    case "percentage":
      return v.toLocaleString("en-PH", { maximumFractionDigits: 1 }) + "%";
    case "ratio":
      return v.toFixed(1) + "×";
    case "months":
      return v.toFixed(1) + " mo";
    case "number":
    default:
      return v.toLocaleString("en-PH", { maximumFractionDigits: 1 });
  }
}

const COMPACT = new Intl.NumberFormat("en-PH", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/**
 * Peso for space-constrained tiles: full digits below ₱1M, compact above
 * (₱166.3M). Pair with a `title` holding `pesoRound(n)` so precision is one
 * hover away.
 */
export function pesoCompact(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1_000_000) return pesoRound(n);
  const sign = n < 0 ? "-" : "";
  return sign + "₱" + COMPACT.format(Math.abs(n));
}

/** Multiple (LTV:CAC style): 1 decimal under 100×, grouped integers to 1M×, compact beyond. */
export function ratioCompact(n: number | null | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs < 100) return n.toFixed(1) + "×";
  if (abs < 1_000_000) return Math.round(n).toLocaleString("en-PH") + "×";
  return COMPACT.format(n) + "×";
}
