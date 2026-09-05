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
      className="group block rounded-xl border border-line bg-panel p-5 shadow-card transition-all duration-200 ease-out-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40 [@media(hover:hover)]:hover:shadow-card-hover motion-reduce:hover:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30"
    >
      <p className="mb-2 text-2xl">{icon}</p>
      <p className="mb-1 text-[15px] font-semibold text-ink group-hover:text-coir-dark transition-colors">
        {name}
      </p>
      <p className="text-xs leading-relaxed text-ink-soft">{description}</p>
    </Link>
  );
}

export default function Dashboard() {
  return (
    <div>
      <header className="mb-8 border-b border-line pb-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir mb-1.5">
          Internal — founders, sales & BD, investors
        </p>
        <h1 className="mb-2 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Bughaw Calculators Hub
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Unit economics, go-to-market, and forecasting tools for the coconut slipper
          line and beyond. All figures in ₱; team data is shared across everyone signed in.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-ink mb-1">Live tools</h2>
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
          <h2 className="text-lg font-semibold text-ink mb-1">{cat.name}</h2>
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
