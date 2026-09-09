export interface PnlState {
  unitsM1: number;
  growthPct: number;
  price: number;
  cogs: number;
  cac: number;
  opexMachines: number;
  opexSalaries: number;
  opexLogistics: number;
}

export const PNL_DEFAULTS: PnlState = {
  unitsM1: 150,
  growthPct: 15,
  price: 150,
  cogs: 30,
  cac: 40,
  opexMachines: 20000,
  opexSalaries: 30000,
  opexLogistics: 6000,
};

function safeNum(v: number | undefined, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function computePnl(s: PnlState) {
  const profits: number[] = [];
  let prevUnits = 0;
  let runningUnits = 0;
  let breakevenMonth: number | null = null;
  let breakevenUnits: number | null = null;
  let cumulative = 0;

  const unitsM1 = Math.max(0, Math.round(safeNum(s.unitsM1)));
  const growthPct = safeNum(s.growthPct);
  const price = Math.max(0, safeNum(s.price));
  const cogs = Math.max(0, safeNum(s.cogs));
  const cac = Math.max(0, safeNum(s.cac));
  const opexMachines = Math.max(0, safeNum(s.opexMachines));
  const opexSalaries = Math.max(0, safeNum(s.opexSalaries));
  const opexLogistics = Math.max(0, safeNum(s.opexLogistics));
  const fixedOpex = opexMachines + opexSalaries + opexLogistics;

  for (let m = 1; m <= 12; m++) {
    if (m === 1) {
      runningUnits = unitsM1;
    } else {
      const grown = runningUnits * (1 + growthPct / 100);
      runningUnits = Number.isFinite(grown) ? Math.max(0, Math.round(grown)) : runningUnits;
    }
    const newUnits = m === 1 ? runningUnits : Math.max(0, runningUnits - prevUnits);
    const revenue = runningUnits * price;
    const variableCogs = runningUnits * cogs;
    const cacCost = newUnits * cac;
    const profit = revenue - variableCogs - fixedOpex - cacCost;
    const safeProfit = Number.isFinite(profit) ? profit : 0;
    profits.push(safeProfit);
    cumulative += safeProfit;
    if (breakevenMonth === null && safeProfit >= 0) {
      breakevenMonth = m;
      breakevenUnits = runningUnits;
    }
    prevUnits = runningUnits;
  }
  return { profits, breakevenMonth, breakevenUnits, cumulative };
}
