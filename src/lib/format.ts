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
