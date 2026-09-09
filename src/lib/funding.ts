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
  const pre = Number.isFinite(s.preMoney) ? s.preMoney : 0;
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const postMoney = pre + safeAmount;
  const investorPct = postMoney > 0 ? (safeAmount / postMoney) * 100 : 0;
  const pct = Number.isFinite(s.targetInvestorPct) ? s.targetInvestorPct : 0;
  const impliedPostMoney = pct > 0 && pct < 100 ? safeAmount / (pct / 100) : pct <= 0 ? Infinity : safeAmount;
  const impliedPreMoney = pct > 0 && pct < 100 ? impliedPostMoney - safeAmount : pct <= 0 ? Infinity : 0;
  return {
    postMoney,
    investorPct,
    founderPctAfter: Number.isFinite(investorPct) ? Math.max(0, 100 - investorPct) : 0,
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
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const nextRound = Number.isFinite(s.nextRoundPreMoney) ? s.nextRoundPreMoney : 0;
  const discount = Number.isFinite(s.discountPct) ? s.discountPct : 0;
  const discountBasis = nextRound * Math.max(0, 1 - discount / 100);
  const cap = Number.isFinite(s.valuationCap) ? s.valuationCap : 0;
  const capBasis = cap > 0 ? Math.min(cap, discountBasis) : discountBasis;
  const denominator = capBasis + safeAmount;
  const conversionPct = denominator > 0 ? (safeAmount / denominator) * 100 : 0;
  return {
    discountBasis,
    capBasis,
    conversionPct,
    founderPctAfter: Number.isFinite(conversionPct) ? Math.max(0, 100 - conversionPct) : 0,
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
  const own = Number.isFinite(s.ownCapital) ? s.ownCapital : 0;
  const partner = Number.isFinite(s.partnerCapital) ? s.partnerCapital : 0;
  const totalCapital = own + partner;
  const capitalOwnPct = totalCapital > 0 ? (own / totalCapital) * 100 : 50;
  const sweat = Number.isFinite(s.sweatEquityPct) ? s.sweatEquityPct : 0;
  const ownershipOwnPct = Math.min(100, Math.max(0, capitalOwnPct + sweat));
  const ownershipPartnerPct = 100 - ownershipOwnPct;
  const profit = Number.isFinite(s.projectedAnnualProfit) ? s.projectedAnnualProfit : 0;
  const split = Number.isFinite(s.profitSplitOwnPct) ? Math.min(100, Math.max(0, s.profitSplitOwnPct)) : 0;
  const ownProfitShare = profit * (split / 100);
  const partnerProfitShare = Math.max(0, profit - ownProfitShare);
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
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const n = Math.max(1, Math.round(Number.isFinite(s.termMonths) ? s.termMonths : 0));
  const annualRate = Number.isFinite(s.annualInterestPct) ? s.annualInterestPct : 0;
  const r = Math.max(0, annualRate) / 100 / 12;
  const compoundFactor = r > 0 ? 1 - Math.pow(1 + r, -n) : 0;
  const monthlyPayment = compoundFactor > 0 ? (safeAmount * r) / compoundFactor : safeAmount / n;
  const totalRepaid = monthlyPayment * n;
  const cashFlow = Number.isFinite(s.monthlyCashFlow) ? s.monthlyCashFlow : 0;
  return {
    monthlyPayment,
    totalRepaid,
    totalInterest: Math.max(0, totalRepaid - safeAmount),
    coverageRatio: monthlyPayment > 0 ? cashFlow / monthlyPayment : Infinity,
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
