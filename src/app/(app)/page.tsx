import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, FolderKanban, Target, type LucideIcon } from "lucide-react";
import { TOOLS } from "@/lib/tools";
import { getIcon } from "@/lib/icons";
import { FeaturedCard } from "@/components/ui/card";
import { SectionIntro } from "@/components/SectionIntro";
import { Button } from "@/components/ui/button";
import { getAccess } from "@/lib/session";
import { canSee, toolSection } from "@/lib/access";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Calculators, CRM, and task management for running Bughaw Innovations operations.",
};

export const dynamic = "force-dynamic";

function QuickLink({
  href,
  icon: Icon,
  title,
  blurb,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 rounded-xl border border-line bg-panel p-5 shadow-card transition-all duration-200 ease-out-strong [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:border-coir/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-coir-bg text-coir-dark">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span>
        <span className="block text-[15px] font-semibold text-ink group-hover:text-coir-dark transition-colors">
          {title}
        </span>
        <span className="block text-xs text-ink-soft">{blurb}</span>
      </span>
    </Link>
  );
}

export default async function Dashboard() {
  // Each card only renders for people who can open it (0010_section_access.sql).
  const access = await getAccess();
  const visibleTools = TOOLS.filter((t) => {
    const key = toolSection(t.id);
    return key !== null && canSee(access, key);
  });
  const [primary, ...rest] = visibleTools;
  const showCalculators = canSee(access, "calculators");
  const showCrm = canSee(access, "crm");
  const showTasks = canSee(access, "tasks");
  const nothingShared = !primary && !showCalculators && !showCrm && !showTasks;

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

      {nothingShared && (
        <p className="mb-10 rounded-xl border border-line bg-panel p-5 text-sm text-ink-soft shadow-card">
          Nothing has been shared with you yet. Ask a super admin to give you access to
          the sections you need.
        </p>
      )}

      {primary && (
        <section className="mb-10">
          <SectionIntro
            eyebrow="Live tools"
            title="Featured"
            blurb="Hand-built simulators, updated as the business changes."
          />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FeaturedCard
              href={primary.path}
              icon={getIcon(primary.icon)}
              name={primary.name}
              description={primary.description}
              size="lg"
              className="sm:col-span-2"
            />
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
      )}

      {showCalculators && (
        <section className="mb-10">
          <SectionIntro
            eyebrow="Full catalog"
            title="Every calculator"
            blurb="Unit economics, go-to-market, product, and financial models — searchable by name or category."
            action={
              <Button asChild size="sm">
                <Link href="/calculators">
                  Browse all
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                </Link>
              </Button>
            }
          />
        </section>
      )}

      {(showCrm || showTasks) && (
        <section>
          <SectionIntro eyebrow="Elsewhere" title="Quick links" />
          <div className="grid gap-4 sm:grid-cols-2">
            {showCrm && (
              <QuickLink
                href="/crm"
                icon={Target}
                title="CRM lead funnel"
                blurb="Track hotel accounts through the pipeline"
              />
            )}
            {showTasks && (
              <QuickLink
                href="/tasks"
                icon={FolderKanban}
                title="Projects & boards"
                blurb="Everything the team is working on"
              />
            )}
          </div>
        </section>
      )}
    </div>
  );
}
