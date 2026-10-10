"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabBar, TabPanel } from "@/components/ui/tab-bar";
import { cn } from "@/lib/cn";
import {
  STATUS_LABEL,
  manilaToday,
  summarizeCardEvents,
  type BusinessCard,
  type CardStatus,
  type RollupRow,
} from "@/lib/cards";
import { CardEditor } from "./CardEditor";
import { CardAnalytics } from "./CardAnalytics";

type Tab = "cards" | "analytics";
const TABS = [
  { id: "cards", label: "Cards" },
  { id: "analytics", label: "Analytics" },
] as const;

export const STATUS_PILL: Record<CardStatus, string> = {
  draft: "border-line bg-paper text-ink-soft",
  published: "border-success-border bg-success-bg text-success",
  suspended: "border-danger-border bg-danger-bg text-danger",
};

export function StatusPill({ status }: { status: CardStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        STATUS_PILL[status]
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CardsAdmin({
  initialCards,
  rollup,
  loadError,
  wallet,
}: {
  initialCards: BusinessCard[];
  rollup: RollupRow[];
  loadError: string | null;
  wallet: { apple: boolean; google: boolean };
}) {
  const [tab, setTab] = useState<Tab>("cards");
  const [cards, setCards] = useState(initialCards);
  // null = list only, "new" = blank editor, otherwise a card id.
  const [selected, setSelected] = useState<string | null>(initialCards[0]?.id ?? null);

  const views30 = useMemo(
    () => summarizeCardEvents(rollup, { today: manilaToday(), days: 30 }).perCard,
    [rollup]
  );
  const current = cards.find((c) => c.id === selected) ?? null;

  function upsert(card: BusinessCard) {
    setCards((prev) => {
      const next = prev.some((c) => c.id === card.id)
        ? prev.map((c) => (c.id === card.id ? card : c))
        : [...prev, card];
      return next.sort((a, b) => a.full_name.localeCompare(b.full_name));
    });
    setSelected(card.id);
  }

  function remove(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
    setSelected(null);
  }

  return (
    <div className="space-y-5">
      {loadError && (
        <p className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {loadError}
        </p>
      )}

      <TabBar idBase="cards-admin" tabs={TABS} value={tab} onChange={setTab} />

      <TabPanel idBase="cards-admin" value="cards" current={tab}>
        <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <Button intent="primary" className="w-full" onClick={() => setSelected("new")}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New card
            </Button>
            <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white shadow-card">
              {cards.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-ink-soft">No cards yet.</li>
              )}
              {cards.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    aria-current={selected === c.id ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start justify-between gap-2 px-4 py-3 text-left transition-colors focus:outline-none focus-visible:bg-coir-bg",
                      selected === c.id ? "bg-coir-bg" : "hover:bg-paper"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink">{c.full_name}</span>
                      <span className="block truncate text-[12px] text-ink-soft">{c.job_title || "—"}</span>
                      <span className="mt-1 block font-mono text-[10.5px] text-ink-soft">
                        {(views30[c.id]?.views ?? 0).toLocaleString()} views · 30d
                      </span>
                    </span>
                    <StatusPill status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section aria-label="Card editor">
            {selected === "new" ? (
              <CardEditor key="new" card={null} wallet={wallet} onSaved={upsert} onDeleted={remove} />
            ) : current ? (
              <CardEditor
                key={current.id}
                card={current}
                wallet={wallet}
                onSaved={upsert}
                onDeleted={remove}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-line bg-white/60 px-6 py-12 text-center text-[13px] text-ink-soft">
                Select a card to edit it, or create a new one.
              </div>
            )}
          </section>
        </div>
      </TabPanel>

      <TabPanel idBase="cards-admin" value="analytics" current={tab}>
        <CardAnalytics cards={cards} rollup={rollup} />
      </TabPanel>
    </div>
  );
}
