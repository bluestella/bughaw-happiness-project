import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { requirePeople } from "../access";
import { PeopleTabs } from "../PeopleShell";
import { InternsClient } from "./InternsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Interns — People" };

export default async function InternsPage() {
  const p = await requirePeople();
  if (!p.isAdmin) redirect("/people");
  const team = await p.supabase.rpc("list_team_directory");
  return (
    <div>
      <CalculatorHeader
        icon={Users}
        eyebrow="People"
        title="Interns"
        description="Add each intern with their school, required hours and supervisor. They must already be on the invite list."
      />
      <PeopleTabs hasOwn={!!p.own} reviewer isAdmin />
      <InternsClient
        interns={p.profiles}
        team={((team.data ?? []) as { email: string; note: string | null }[]).map((t) => ({ email: t.email, note: t.note }))}
      />
    </div>
  );
}
