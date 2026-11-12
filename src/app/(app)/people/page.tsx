import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { requirePeople } from "./access";
import { PeopleTabs } from "./PeopleShell";

export const dynamic = "force-dynamic";

export default async function PeopleIndex() {
  const p = await requirePeople();
  if (p.own) redirect("/people/my-log");
  if (p.reviewer) redirect("/people/review");
  return (
    <div>
      <CalculatorHeader icon={Users} eyebrow="People" title="Intern logs and reports" />
      <PeopleTabs hasOwn={false} reviewer={false} isAdmin={false} />
      <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-ink-soft">
        You are not set up as an intern or a supervisor yet. Ask the owner to add you.
      </div>
    </div>
  );
}
