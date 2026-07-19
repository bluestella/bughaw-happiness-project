import { notFound } from "next/navigation";
import { ALL_CALCULATORS, getCalculator } from "@/lib/calculators/registry";
import { CalculatorClient } from "@/components/CalculatorClient";

export function generateStaticParams() {
  return ALL_CALCULATORS.map((c) => ({
    category: c.category,
    calculatorId: c.id,
  }));
}

export default function CalculatorPage({
  params,
}: {
  params: { category: string; calculatorId: string };
}) {
  const config = getCalculator(params.category, params.calculatorId);
  if (!config) notFound();
  return <CalculatorClient category={params.category} calculatorId={params.calculatorId} />;
}
