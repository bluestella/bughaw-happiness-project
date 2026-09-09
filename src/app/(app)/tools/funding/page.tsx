"use client";

import { useEffect, useMemo, useState } from "react";
import { Handshake, RotateCcw } from "lucide-react";
import { CalculatorHeader } from "@/components/CalculatorHeader";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/tooltip";
import { TabBar } from "@/components/ui/tab-bar";
import { formatValue, peso, pesoRound } from "@/lib/format";
import {
  amountNeeded,
  computeComparison,
  computeEquity,
  computeJv,
  computeLoan,
  computeSafe,
  FUNDING_DEFAULTS as DEFAULTS,
  type FundingState,
  type FundingTab,
} from "@/lib/funding";

const KEY = "bughaw-funding";

function NumField({
  label,
  value,
  onChange,
  peso: isPeso,
  pct,
  step,
  help,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  peso?: boolean;
  pct?: boolean;
  step?: number;
  help?: string;
}) {
  // Draft-string editing: keep the raw string while focused so clearing the
  // field doesn't snap to 0 mid-edit; parse on commit.
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    onChange(isNaN(n) ? 0 : Math.max(0, n));
  };
  return (
    <label className="block mb-4 last:mb-0">
      <span className="flex items-center gap-1 text-[13px] text-ink-soft mb-1.5">
        {label}
        {help && <InfoTip text={help} label={`About ${label}`} />}
      </span>
      <span className="relative block">
        {isPeso && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">
            ₱
          </span>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={draft ?? String(value)}
          onFocus={() => setDraft(String(value))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => {
            commit(e.target.value);
            setDraft(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
          }}
          className={`w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-[14px] transition-colors focus:border-coir focus:outline-none focus:ring-2 focus:ring-coir/20 ${
            isPeso ? "pl-7" : ""
          } ${pct ? "pr-8" : ""}`}
        />
        {pct && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">
            %
          </span>
        )}
      </span>
    </label>
  );
}

function Stat({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  note?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
        {label}
      </p>
      <p
        className={`font-semibold tabular-nums ${
          emphasis ? "text-2xl text-coir-dark" : "text-xl text-ink"
        }`}
      >
        {value}
      </p>
      {note && <p className="text-[11px] text-ink-soft mt-1">{note}</p>}
    </div>
  );
}

function VerdictBanner({ tone, text }: { tone: "ok" | "warn" | "danger"; text: string }) {
  const styles =
    tone === "ok"
      ? "bg-success-bg border-success-border text-success"
      : tone === "warn"
        ? "bg-amber-bg border-amber-border text-amber"
        : "bg-danger-bg border-danger-border text-danger";
  return (
    <div className={`border rounded-xl px-4 py-3 text-[13px] font-semibold ${styles}`}>
      {text}
    </div>
  );
}

const TABS: { id: FundingTab; label: string }[] = [
  { id: "equity", label: "Equity" },
  { id: "safe", label: "SAFE / Convertible" },
  { id: "jv", label: "Joint Venture" },
  { id: "loan", label: "Loan" },
  { id: "compare", label: "Compare" },
];

export default function FundingPage() {
  const [s, setS] = useState<FundingState>(() => {
    if (typeof window === "undefined") return DEFAULTS;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return DEFAULTS;
  });
  const [tab, setTab] = useState<FundingTab>("equity");

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {}
  }, [s]);

  const set = (patch: Partial<FundingState>) => setS((prev) => ({ ...prev, ...patch }));

  const amount = useMemo(() => amountNeeded(s), [s]);
  const equity = useMemo(() => computeEquity(amount, s), [amount, s]);
  const safe = useMemo(() => computeSafe(amount, s), [amount, s]);
  const jv = useMemo(() => computeJv(s), [s]);
  const loan = useMemo(() => computeLoan(amount, s), [amount, s]);
  const rows = useMemo(() => computeComparison(s), [s]);

  const modeBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-md border px-3 py-1.5 text-[12px] font-semibold transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-coir/30 ${
        active
          ? "bg-coir-bg border-coir/50 text-coir-dark"
          : "bg-panel border-line text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  const equityVerdict: { tone: "ok" | "warn" | "danger"; text: string } = !Number.isFinite(
    equity.investorPct
  )
    ? { tone: "warn", text: "Enter a pre-money valuation to see the dilution picture." }
    : equity.investorPct <= 25
      ? {
          tone: "ok",
          text: `Giving up ${formatValue("percentage", equity.investorPct)} is within the typical 10–25% range for an early round.`,
        }
      : equity.investorPct <= 35
        ? {
            tone: "warn",
            text: `${formatValue("percentage", equity.investorPct)} dilution is on the heavy side — consider a higher valuation or a smaller ask.`,
          }
        : {
            tone: "danger",
            text: `${formatValue("percentage", equity.investorPct)} dilution leaves founders with too little to stay motivated through future rounds.`,
          };

  const loanVerdict: { tone: "ok" | "warn" | "danger"; text: string } =
    loan.coverageRatio >= 1.5
      ? {
          tone: "ok",
          text: `Monthly cash flow covers the payment ${formatValue("ratio", loan.coverageRatio)} over — comfortable headroom.`,
        }
      : loan.coverageRatio >= 1
        ? {
            tone: "warn",
            text: `Cash flow only covers the payment ${formatValue("ratio", loan.coverageRatio)} — one bad month puts repayment at risk.`,
          }
        : {
            tone: "danger",
            text: "The monthly payment exceeds projected monthly cash flow — this loan is not serviceable at these assumptions.",
          };

  return (
    <div>
      <CalculatorHeader
        icon={Handshake}
        eyebrow="Internal — Bughaw Innovations"
        title="Funding & Investor Ask"
        description="Work out how much to ask a potential investor, what percentage to give, and how that compares to a SAFE, a joint venture, or a loan for the same capital need."
        action={
          <Button size="sm" className="mt-3" onClick={() => setS(DEFAULTS)}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
            Reset to defaults
          </Button>
        }
      />

      {/* Shared assumptions */}
      <div className="mb-5 rounded-xl border border-line bg-panel p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            How much do we need?
          </h2>
          <div className="flex gap-2">
            {modeBtn(s.amountMode === "direct", "Enter amount", () =>
              set({ amountMode: "direct" })
            )}
            {modeBtn(s.amountMode === "burn", "From burn × runway", () =>
              set({ amountMode: "burn" })
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 items-end">
          {s.amountMode === "direct" ? (
            <NumField
              label="Amount needed"
              value={s.amountNeeded}
              onChange={(v) => set({ amountNeeded: v })}
              peso
              step={50000}
              help="The total capital you want to raise in this round."
            />
          ) : (
            <>
              <NumField
                label="Monthly burn"
                value={s.monthlyBurn}
                onChange={(v) => set({ monthlyBurn: v })}
                peso
                step={10000}
                help="Net cash spent per month (expenses minus revenue)."
              />
              <NumField
                label="Runway target (months)"
                value={s.runwayTargetMonths}
                onChange={(v) => set({ runwayTargetMonths: v })}
                help="How many months this raise should keep the company funded. 18–24 is common."
              />
            </>
          )}
          <div className="sm:col-start-3">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-1">
              Amount needed
            </p>
            <p className="text-3xl font-semibold tabular-nums text-coir-dark">
              {pesoRound(amount)}
            </p>
          </div>
        </div>
      </div>

      <TabBar className="mb-5" tabs={TABS} value={tab} onChange={setTab} />

      {tab === "equity" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <div className="flex gap-2 mb-4">
              {modeBtn(s.equityMode === "valuation", "I know my valuation", () =>
                set({ equityMode: "valuation" })
              )}
              {modeBtn(s.equityMode === "percent", "I know the %", () =>
                set({ equityMode: "percent" })
              )}
            </div>
            {s.equityMode === "valuation" ? (
              <NumField
                label="Pre-money valuation"
                value={s.preMoney}
                onChange={(v) => set({ preMoney: v })}
                peso
                step={500000}
                help="What the company is worth before the investor's money goes in."
              />
            ) : (
              <NumField
                label="% you're willing to give"
                value={s.targetInvestorPct}
                onChange={(v) => set({ targetInvestorPct: v })}
                pct
                help="The ownership stake you're prepared to offer for the amount needed."
              />
            )}
          </div>
          <div className="space-y-4">
            {s.equityMode === "valuation" ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="The ask"
                  value={`${pesoRound(amount)} for ${formatValue("percentage", equity.investorPct)}`}
                  emphasis
                  note={`Post-money valuation: ${pesoRound(equity.postMoney)}`}
                />
                <Stat
                  label="Investor gets"
                  value={formatValue("percentage", equity.investorPct)}
                />
                <Stat
                  label="Founders keep"
                  value={formatValue("percentage", equity.founderPctAfter)}
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Stat
                  label="Implied pre-money"
                  value={pesoRound(equity.impliedPreMoney)}
                  emphasis
                  note="The valuation you're effectively claiming at this %."
                />
                <Stat label="Implied post-money" value={pesoRound(equity.impliedPostMoney)} />
                <Stat
                  label="Founders keep"
                  value={formatValue(
                    "percentage",
                    s.targetInvestorPct > 0 ? 100 - s.targetInvestorPct : NaN
                  )}
                />
              </div>
            )}
            <VerdictBanner
              tone={
                s.equityMode === "percent"
                  ? s.targetInvestorPct <= 25
                    ? "ok"
                    : s.targetInvestorPct <= 35
                      ? "warn"
                      : "danger"
                  : equityVerdict.tone
              }
              text={
                s.equityMode === "percent"
                  ? s.targetInvestorPct <= 25
                    ? `Offering ${formatValue("percentage", s.targetInvestorPct)} is within the typical 10–25% range for an early round.`
                    : s.targetInvestorPct <= 35
                      ? `Offering ${formatValue("percentage", s.targetInvestorPct)} is on the heavy side for one round.`
                      : `Offering ${formatValue("percentage", s.targetInvestorPct)} leaves founders with too little for future rounds.`
                  : equityVerdict.text
              }
            />
          </div>
        </div>
      )}

      {tab === "safe" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <NumField
              label="Valuation cap"
              value={s.valuationCap}
              onChange={(v) => set({ valuationCap: v })}
              peso
              step={500000}
              help="Maximum valuation at which the SAFE converts to equity."
            />
            <NumField
              label="Discount"
              value={s.discountPct}
              onChange={(v) => set({ discountPct: v })}
              pct
              help="Discount on the next round's price if the cap doesn't apply. 15–25% is typical."
            />
            <NumField
              label="Assumed next-round pre-money"
              value={s.nextRoundPreMoney}
              onChange={(v) => set({ nextRoundPreMoney: v })}
              peso
              step={500000}
              help="Your guess at the valuation of the next priced round, when the SAFE converts."
            />
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Estimated dilution at conversion"
                value={formatValue("percentage", safe.conversionPct)}
                emphasis
                note="Post-money-style estimate — the exact number is settled at the next priced round."
              />
              <Stat
                label="Converts at"
                value={pesoRound(safe.capBasis)}
                note={
                  safe.capBasis === s.valuationCap && safe.capBasis <= safe.discountBasis
                    ? "The cap applies (lower than the discounted price)."
                    : "The discounted next-round price applies."
                }
              />
              <Stat
                label="Founders keep (est.)"
                value={formatValue("percentage", safe.founderPctAfter)}
              />
            </div>
            <p className="text-[12px] text-ink-soft">
              A SAFE raises {pesoRound(amount)} now without setting a valuation today. It
              converts to shares at the next priced round, at the better of the cap or the
              discounted price for the investor.
            </p>
          </div>
        </div>
      )}

      {tab === "jv" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <NumField
              label="Our capital contribution"
              value={s.ownCapital}
              onChange={(v) => set({ ownCapital: v })}
              peso
              step={50000}
            />
            <NumField
              label="Partner's capital contribution"
              value={s.partnerCapital}
              onChange={(v) => set({ partnerCapital: v })}
              peso
              step={50000}
            />
            <NumField
              label="Our sweat equity credit"
              value={s.sweatEquityPct}
              onChange={(v) => set({ sweatEquityPct: v })}
              pct
              help="Extra ownership credited to us for product, operations, and know-how beyond cash."
            />
            <NumField
              label="Our share of profit"
              value={s.profitSplitOwnPct}
              onChange={(v) => set({ profitSplitOwnPct: v })}
              pct
              help="The agreed profit split — it doesn't have to match the ownership split."
            />
            <NumField
              label="Projected annual profit"
              value={s.projectedAnnualProfit}
              onChange={(v) => set({ projectedAnnualProfit: v })}
              peso
              step={50000}
            />
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Ownership split"
                value={`${formatValue("percentage", jv.ownershipOwnPct)} / ${formatValue("percentage", jv.ownershipPartnerPct)}`}
                emphasis
                note="Us / partner — capital split plus our sweat equity credit."
              />
              <Stat
                label="Our profit share / yr"
                value={pesoRound(jv.ownProfitShare)}
              />
              <Stat
                label="Partner profit share / yr"
                value={pesoRound(jv.partnerProfitShare)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Stat
                label="Total JV capital"
                value={pesoRound(jv.totalCapital)}
                note={
                  jv.totalCapital < amount
                    ? `Short of the ${pesoRound(amount)} needed — adjust contributions.`
                    : `Covers the ${pesoRound(amount)} needed.`
                }
              />
              <Stat
                label="Partner payback"
                value={
                  Number.isFinite(jv.partnerPaybackYears)
                    ? jv.partnerPaybackYears.toFixed(1) + " yrs"
                    : "—"
                }
                note="Years of profit share until the partner recovers their capital."
              />
            </div>
          </div>
        </div>
      )}

      {tab === "loan" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
            <NumField
              label="Annual interest rate"
              value={s.annualInterestPct}
              onChange={(v) => set({ annualInterestPct: v })}
              pct
              step={0.5}
            />
            <NumField
              label="Term (months)"
              value={s.termMonths}
              onChange={(v) => set({ termMonths: v })}
            />
            <NumField
              label="Projected monthly cash flow"
              value={s.monthlyCashFlow}
              onChange={(v) => set({ monthlyCashFlow: v })}
              peso
              step={5000}
              help="Cash available each month to service the loan, before the payment."
            />
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat
                label="Monthly payment"
                value={peso(loan.monthlyPayment)}
                emphasis
                note={`Borrowing ${pesoRound(amount)} over ${s.termMonths} months.`}
              />
              <Stat label="Total interest" value={pesoRound(loan.totalInterest)} />
              <Stat label="Total repaid" value={pesoRound(loan.totalRepaid)} />
            </div>
            <VerdictBanner tone={loanVerdict.tone} text={loanVerdict.text} />
          </div>
        </div>
      )}

      {tab === "compare" && (
        <div className="rounded-xl border border-line bg-panel p-5 shadow-card">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft mb-4">
            Same {pesoRound(amount)} need, four ways to fund it
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="py-2 pr-4 font-mono text-[10.5px] uppercase tracking-[0.08em]">Option</th>
                  <th className="py-2 pr-4 font-mono text-[10.5px] uppercase tracking-[0.08em]">Ownership given up</th>
                  <th className="py-2 pr-4 font-mono text-[10.5px] uppercase tracking-[0.08em]">Monthly obligation</th>
                  <th className="py-2 pr-4 font-mono text-[10.5px] uppercase tracking-[0.08em]">Cost of capital / yr¹</th>
                  <th className="py-2 font-mono text-[10.5px] uppercase tracking-[0.08em]">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.option} className="border-b border-line last:border-0">
                    <td className="py-3 pr-4 font-semibold text-ink">{r.option}</td>
                    <td className="py-3 pr-4 font-mono">
                      {r.dilutionPct === null ? "—" : formatValue("percentage", r.dilutionPct)}
                    </td>
                    <td className="py-3 pr-4 font-mono">
                      {r.monthlyObligation === null ? "—" : peso(r.monthlyObligation)}
                    </td>
                    <td className="py-3 pr-4 font-mono">
                      {r.totalCost === 0 ? "—" : pesoRound(r.totalCost)}
                    </td>
                    <td className="py-3 text-ink-soft">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-soft mt-3">
            ¹ Loan shows total interest over the full term; JV shows the partner&apos;s annual
            profit share. Equity and SAFEs cost ownership, not cash — there is no
            &ldquo;cheapest&rdquo; answer, only the trade-off that fits.
          </p>
        </div>
      )}
    </div>
  );
}
