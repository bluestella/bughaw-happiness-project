export type FundingTab = "equity" | "safe" | "jv" | "loan" | "compare";

export interface FundingState {
  // Shared assumptions
  amountMode: "direct" | "burn";
  amountNeeded: number;
  monthlyBurn: number;
  runwayTargetMonths: number;
  // Equity / priced round
  equityMode: "valuation" | "percent";
  preMoney: number;
  targetInvestorPct: number;
  // SAFE / convertible note
  valuationCap: number;
  discountPct: number;
  nextRoundPreMoney: number;
  // Joint venture
  ownCapital: number;
  partnerCapital: number;
  sweatEquityPct: number;
  profitSplitOwnPct: number;
  projectedAnnualProfit: number;
  // Loan
  annualInterestPct: number;
  termMonths: number;
  monthlyCashFlow: number;
}

export const FUNDING_DEFAULTS: FundingState = {
  amountMode: "direct",
  amountNeeded: 1_500_000,
  monthlyBurn: 120_000,
  runwayTargetMonths: 12,
  equityMode: "valuation",
  preMoney: 10_000_000,
  targetInvestorPct: 15,
  valuationCap: 8_000_000,
  discountPct: 20,
  nextRoundPreMoney: 15_000_000,
  ownCapital: 500_000,
  partnerCapital: 1_500_000,
  sweatEquityPct: 10,
  profitSplitOwnPct: 60,
  projectedAnnualProfit: 800_000,
  annualInterestPct: 12,
  termMonths: 36,
  monthlyCashFlow: 60_000,
};

export function amountNeeded(s: FundingState): number {
  if (s.amountMode === "burn") return (s.monthlyBurn || 0) * (s.runwayTargetMonths || 0);
  return s.amountNeeded || 0;
}

export interface EquityResult {
  postMoney: number;
  investorPct: number;
  founderPctAfter: number;
  impliedPreMoney: number;
  impliedPostMoney: number;
}

export function computeEquity(amount: number, s: FundingState): EquityResult {
  const pre = s.preMoney || 0;
  const postMoney = pre + amount;
  const investorPct = postMoney > 0 ? (amount / postMoney) * 100 : NaN;
  const pct = s.targetInvestorPct || 0;
  const impliedPostMoney = pct > 0 ? amount / (pct / 100) : NaN;
  const impliedPreMoney = pct > 0 ? impliedPostMoney - amount : NaN;
  return {
    postMoney,
    investorPct,
    founderPctAfter: Number.isFinite(investorPct) ? 100 - investorPct : NaN,
    impliedPreMoney,
    impliedPostMoney,
  };
}

export interface SafeResult {
  discountBasis: number;
  capBasis: number;
  conversionPct: number;
  founderPctAfter: number;
}

export function computeSafe(amount: number, s: FundingState): SafeResult {
  const discountBasis = (s.nextRoundPreMoney || 0) * (1 - (s.discountPct || 0) / 100);
  const cap = s.valuationCap || 0;
  // The SAFE converts at whichever basis gives the investor more ownership (the lower one).
  const capBasis = cap > 0 ? Math.min(cap, discountBasis) : discountBasis;
  const conversionPct = capBasis + amount > 0 ? (amount / (capBasis + amount)) * 100 : NaN;
  return {
    discountBasis,
    capBasis,
    conversionPct,
    founderPctAfter: Number.isFinite(conversionPct) ? 100 - conversionPct : NaN,
  };
}

export interface JvResult {
  totalCapital: number;
  ownershipOwnPct: number;
  ownershipPartnerPct: number;
  ownProfitShare: number;
  partnerProfitShare: number;
  partnerPaybackYears: number;
}

export function computeJv(s: FundingState): JvResult {
  const own = s.ownCapital || 0;
  const partner = s.partnerCapital || 0;
  const totalCapital = own + partner;
  const capitalOwnPct = totalCapital > 0 ? (own / totalCapital) * 100 : 50;
  // Sweat equity shifts ownership toward Bughaw beyond the pure capital split.
  const ownershipOwnPct = Math.min(100, Math.max(0, capitalOwnPct + (s.sweatEquityPct || 0)));
  const ownershipPartnerPct = 100 - ownershipOwnPct;
  const profit = s.projectedAnnualProfit || 0;
  const ownProfitShare = profit * ((s.profitSplitOwnPct || 0) / 100);
  const partnerProfitShare = profit - ownProfitShare;
  return {
    totalCapital,
    ownershipOwnPct,
    ownershipPartnerPct,
    ownProfitShare,
    partnerProfitShare,
    partnerPaybackYears: partnerProfitShare > 0 ? partner / partnerProfitShare : Infinity,
  };
}

export interface LoanResult {
  monthlyPayment: number;
  totalRepaid: number;
  totalInterest: number;
  coverageRatio: number;
}

export function computeLoan(amount: number, s: FundingState): LoanResult {
  const n = Math.max(1, Math.round(s.termMonths || 0));
  const r = (s.annualInterestPct || 0) / 100 / 12;
  const monthlyPayment = r === 0 ? amount / n : (amount * r) / (1 - Math.pow(1 + r, -n));
  const totalRepaid = monthlyPayment * n;
  return {
    monthlyPayment,
    totalRepaid,
    totalInterest: totalRepaid - amount,
    coverageRatio: monthlyPayment > 0 ? (s.monthlyCashFlow || 0) / monthlyPayment : Infinity,
  };
}

export interface CompareRow {
  option: string;
  dilutionPct: number | null;
  monthlyObligation: number | null;
  totalCost: number;
  note: string;
}

export function computeComparison(s: FundingState): CompareRow[] {
  const amount = amountNeeded(s);
  const equity = computeEquity(amount, s);
  const safe = computeSafe(amount, s);
  const jv = computeJv(s);
  const loan = computeLoan(amount, s);
  return [
    {
      option: "Equity (priced round)",
      dilutionPct: equity.investorPct,
      monthlyObligation: null,
      totalCost: 0,
      note: "Permanent ownership given up; no cash repayment.",
    },
    {
      option: "SAFE / convertible",
      dilutionPct: safe.conversionPct,
      monthlyObligation: null,
      totalCost: 0,
      note: "Dilution is an estimate — settled at the next priced round.",
    },
    {
      option: "Joint venture",
      dilutionPct: jv.ownershipPartnerPct,
      monthlyObligation: jv.partnerProfitShare / 12,
      totalCost: jv.partnerProfitShare,
      note: "Partner shares profit each year, not a fixed debt payment.",
    },
    {
      option: "Loan / debt",
      dilutionPct: null,
      monthlyObligation: loan.monthlyPayment,
      totalCost: loan.totalInterest,
      note: "No dilution; fixed repayment regardless of performance.",
    },
  ];
}
