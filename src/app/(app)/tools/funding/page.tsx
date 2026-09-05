"use client";

import { useEffect, useMemo, useState } from "react";
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
  return (
    <label className="block mb-4 last:mb-0">
      <span className="flex items-baseline gap-1 text-[13px] text-ink-soft mb-1.5">
        {label}
        {help && (
          <span
            className="text-[10px] text-ink-soft/70 cursor-help border border-line rounded-full px-1"
            title={help}
          >
            i
          </span>
        )}
      </span>
      <span className="relative block">
        {isPeso && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">
            ₱
          </span>
        )}
        <input
          type="number"
          value={value}
          min={0}
          step={step ?? 1}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className={`w-full bg-paper border border-line rounded-md px-3 py-2 text-[14px] font-mono focus:outline-none focus:border-coir ${
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
    <div className="bg-panel border border-line rounded-xl p-5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-ink-soft mb-2">
        {label}
      </p>
      <p
        className={`font-display font-semibold ${
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
      ? "bg-coir-bg border-[#D6E4CE] text-coir-dark"
      : tone === "warn"
        ? "bg-[#FBF3E6] border-[#E8D6B8] text-[#8A6420]"
        : "bg-[#FBEBE6] border-[#E8C4B8] text-danger";
  return (
    <div className={`border rounded-xl px-4 py-3 text-[13px] font-semibold ${styles}`}>
      {text}
    </div>
  );
}

const TABS: { id: FundingTab; label: string }[] = [
  { id: "equity", label: "💼 Equity" },
  { id: "safe", label: "📜 SAFE / Convertible" },
  { id: "jv", label: "🤝 Joint Venture" },
  { id: "loan", label: "🏦 Loan" },
  { id: "compare", label: "⚖️ Compare" },
];

export default function FundingPage() {
  const [s, setS] = useState<FundingState>(DEFAULTS);
  const [tab, setTab] = useState<FundingTab>("equity");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setS({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {}
  }, []);
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

  const tabBtn = (id: FundingTab, label: string) => (
    <button
      key={id}
      onClick={() => setTab(id)}
      className={`font-semibold text-[13px] px-4 py-2 rounded-lg border ${
        tab === id
          ? "bg-coir-bg border-coir text-coir-dark"
          : "bg-panel border-line text-ink-soft hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  const modeBtn = (active: boolean, label: string, onClick: () => void) => (
    <button
      onClick={onClick}
      className={`text-[12px] font-semibold px-3 py-1.5 rounded-md border ${
        active
          ? "bg-coir-bg border-coir text-coir-dark"
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
      <header className="mb-6 border-b border-line pb-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-coir-dark mb-1">
          🤝 Internal — Bughaw Innovations
        </p>
        <h1 className="font-display text-3xl font-semibold text-ink mb-1.5">
          Funding &amp; Investor Ask
        </h1>
        <p className="text-sm text-ink-soft max-w-2xl">
          Work out how much to ask a potential investor, what percentage to give, and how
          that compares to a SAFE, a joint venture, or a loan for the same capital need.
        </p>
        <button
          className="mt-3 text-xs border border-line rounded-md px-3 py-2 hover:border-ink-soft"
          onClick={() => setS(DEFAULTS)}
        >
          ↺ Reset to defaults
        </button>
      </header>

      {/* Shared assumptions */}
      <div className="bg-panel border border-line rounded-xl p-5 mb-5">
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
            <p className="font-display text-3xl font-semibold text-coir-dark">
              {pesoRound(amount)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">{TABS.map((t) => tabBtn(t.id, t.label))}</div>

      {tab === "equity" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="bg-panel border border-line rounded-xl p-5">
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
          <div className="bg-panel border border-line rounded-xl p-5">
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
          <div className="bg-panel border border-line rounded-xl p-5">
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
          <div className="bg-panel border border-line rounded-xl p-5">
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
        <div className="bg-panel border border-line rounded-xl p-5">
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
