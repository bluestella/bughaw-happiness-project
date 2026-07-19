"use client";

import { getCalculator } from "@/lib/calculators/registry";
import { CalculatorShell } from "./CalculatorShell";

export function CalculatorClient({
  category,
  calculatorId,
}: {
  category: string;
  calculatorId: string;
}) {
  const config = getCalculator(category, calculatorId);
  if (!config) {
    return <p className="text-sm text-ink-soft">Calculator not found.</p>;
  }
  return <CalculatorShell config={config} />;
}
