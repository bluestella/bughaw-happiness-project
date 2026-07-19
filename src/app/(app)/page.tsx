import Link from "next/link";
import { CATEGORIES } from "@/lib/calculators/types";
import { calculatorsByCategory, calculatorPath } from "@/lib/calculators/registry";
import { TOOLS } from "@/lib/tools";

function Card({
  href,
  icon,
  name,
  description,
}: {
  href: string;
  icon: string;
  name: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-panel border border-line rounded-xl p-5 hover:border-coir transition-colors"
    >
      <p className="text-2xl mb-2">{icon}</p>
      <p className="font-display text-[15px] font-semibold text-ink mb-1">{name}</p>
      <p className="text-xs text-ink-soft leading-relaxed">{description}</p>
    </Link>
  );
}

export default function Dashboard() {
  return (
    <div>
      <header className="mb-8 border-b border-line pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1.5">
          Internal — founders, sales & BD, investors
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-2">
          Bughaw Calculators Hub
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Unit economics, go-to-market, and forecasting tools for the coconut slipper
          line and beyond. All figures in ₱; team data is shared across everyone signed in.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="font-display text-lg font-semibold text-ink mb-1">Live tools</h2>
        <p className="text-xs text-ink-soft mb-4">
          Migrated from the original artifacts — pipeline data now lives in the team database.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TOOLS.map((t) => (
            <Card key={t.id} href={t.path} icon={t.icon} name={t.name} description={t.description} />
          ))}
        </div>
      </section>

      {CATEGORIES.map((cat) => (
        <section key={cat.id} className="mb-10">
          <h2 className="font-display text-lg font-semibold text-ink mb-1">{cat.name}</h2>
          <p className="text-xs text-ink-soft mb-4">{cat.blurb}</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {calculatorsByCategory(cat.id).map((c) => (
              <Card
                key={c.id}
                href={calculatorPath(c)}
                icon={c.icon}
                name={c.name}
                description={c.description}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
