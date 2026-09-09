import Link from "next/link";
import { ArrowRight, FolderKanban, Target } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { getIcon } from "@/lib/icons";
import { FeaturedCard } from "@/components/ui/card";
import { SectionIntro } from "@/components/SectionIntro";

export default function Dashboard() {
  const [primary, ...rest] = TOOLS;

  return (
    <div>
      <header className="mb-10 border-b border-line pb-7">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-coir">
          Internal — founders, sales &amp; BD, investors
        </p>
        <h1 className="mb-3 font-display text-4xl sm:text-5xl font-semibold tracking-tight text-ink">
          Bughaw Suite
        </h1>
        <p className="max-w-xl text-sm text-ink-soft">
          Calculators, CRM, and task management for running Bughaw operations. All
          figures in ₱; team data is shared across everyone signed in.
        </p>
      </header>

      <section className="mb-10">
        <SectionIntro
          eyebrow="Live tools"
          title="Featured"
          blurb="Hand-built simulators, updated as the business changes."
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {primary && (
            <FeaturedCard
              href={primary.path}
              icon={getIcon(primary.icon)}
              name={primary.name}
              description={primary.description}
              size="lg"
              className="sm:col-span-2"
            />
          )}
          {rest.map((t) => (
            <FeaturedCard
              key={t.id}
              href={t.path}
              icon={getIcon(t.icon)}
              name={t.name}
              description={t.description}
            />
          ))}
        </div>
      </section>

      <section className="mb-10">
        <SectionIntro
          eyebrow="Full catalog"
          title="Every calculator"
          blurb="Unit economics, go-to-market, product, and financial models — searchable by name or category."
          action={
            <Link
              href="/calculators"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3.5 py-2 text-xs font-semibold text-ink shadow-card transition-colors hover:border-coir hover:text-coir-dark"
            >
              Browse all
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            </Link>
          }
        />
      </section>

      <section>
        <SectionIntro eyebrow="Elsewhere" title="Quick links" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/crm"
            className="group flex items-center gap-3.5 rounded-xl border border-line bg-panel p-5 shadow-card transition-all duration-200 ease-out-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coir-bg text-coir-dark">
              <Target className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink group-hover:text-coir-dark transition-colors">
                CRM lead funnel
              </span>
              <span className="block text-xs text-ink-soft">
                Track hotel accounts through the pipeline
              </span>
            </span>
          </Link>
          <Link
            href="/tasks"
            className="group flex items-center gap-3.5 rounded-xl border border-line bg-panel p-5 shadow-card transition-all duration-200 ease-out-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coir-bg text-coir-dark">
              <FolderKanban className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <span>
              <span className="block text-[15px] font-semibold text-ink group-hover:text-coir-dark transition-colors">
                Projects &amp; boards
              </span>
              <span className="block text-xs text-ink-soft">
                Everything the team is working on
              </span>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}
