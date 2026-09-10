import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ALL_CALCULATORS, getCalculator } from "@/lib/calculators/registry";
import { CalculatorClient } from "@/components/CalculatorClient";

export function generateStaticParams() {
  return ALL_CALCULATORS.map((c) => ({
    category: c.category,
    calculatorId: c.id,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: { category: string; calculatorId: string };
}): Promise<Metadata> {
  const config = getCalculator(params.category, params.calculatorId);
  return {
    title: config ? config.name : "Calculator",
    description: config?.description ?? "Bughaw Suite calculator.",
  };
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
