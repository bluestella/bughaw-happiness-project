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

export function computePnl(s: PnlState) {
  const profits: number[] = [];
  let prevUnits = 0;
  let units = 0;
  let breakevenMonth: number | null = null;
  let breakevenUnits: number | null = null;
  let cumulative = 0;
  for (let m = 1; m <= 12; m++) {
    units = m === 1 ? s.unitsM1 : Math.round(units * (1 + s.growthPct / 100));
    const newUnits = m === 1 ? units : Math.max(0, units - prevUnits);
    const profit =
      units * s.price -
      units * s.cogs -
      (s.opexMachines + s.opexSalaries + s.opexLogistics + newUnits * s.cac);
    profits.push(profit);
    cumulative += profit;
    if (breakevenMonth === null && profit >= 0) {
      breakevenMonth = m;
      breakevenUnits = units;
    }
    prevUnits = units;
  }
  return { profits, breakevenMonth, breakevenUnits, cumulative };
}
