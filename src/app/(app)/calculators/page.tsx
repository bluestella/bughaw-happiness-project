import { SectionIntro } from "@/components/SectionIntro";
import { CalculatorCatalog } from "@/components/CalculatorCatalog";

export default function CalculatorsPage() {
  return (
    <div>
      <SectionIntro
        eyebrow="Full catalog"
        title="Calculators"
        blurb="Every unit-economics, go-to-market, product, and financial model in one searchable index. Filter by category or type to find one."
        className="mb-8 border-b border-line pb-6"
      />
      <CalculatorCatalog />
    </div>
  );
}
