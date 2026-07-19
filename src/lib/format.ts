export type OutputFormat = "currency" | "percentage" | "number" | "ratio" | "months";

export function peso(n: number, decimals = 2): string {
  if (!isFinite(n)) return "—";
  return (
    "₱" +
    n.toLocaleString("en-PH", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function pesoRound(n: number): string {
  if (!isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  return sign + "₱" + Math.abs(Math.round(n)).toLocaleString("en-PH");
}

export function formatValue(format: OutputFormat, v: number): string {
  if (!isFinite(v)) return "—";
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
