import type { CalculatorConfig, CategoryId } from "./types";
import { unitEconomicsCalculators } from "./configs/unitEconomics";
import { goToMarketCalculators } from "./configs/goToMarket";
import { productMgmtCalculators } from "./configs/productMgmt";
import { financialCalculators } from "./configs/financial";

export const ALL_CALCULATORS: CalculatorConfig[] = [
  ...unitEconomicsCalculators,
  ...goToMarketCalculators,
  ...productMgmtCalculators,
  ...financialCalculators,
];

export function getCalculator(category: string, id: string): CalculatorConfig | undefined {
  return ALL_CALCULATORS.find((c) => c.category === category && c.id === id);
}

export function calculatorsByCategory(category: CategoryId): CalculatorConfig[] {
  return ALL_CALCULATORS.filter((c) => c.category === category);
}

export function calculatorPath(c: CalculatorConfig): string {
  return `/calculators/${c.category}/${c.id}`;
}
