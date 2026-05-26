import type Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export interface FYGroup {
  fy: number;
  months: string[];
}

export interface ValuationAssumptions {
  waccPct?: Decimal.Value;
  terminalGrowthPct?: Decimal.Value;
  evEbitdaMultiple?: Decimal.Value;
  evRevenueMultiple?: Decimal.Value;
  peMultiple?: Decimal.Value;
  netDebt?: Decimal.Value;
  pbMultiple?: Decimal.Value;
  // % of AUM applied as an enterprise-value multiple (e.g. HPS / BlackRock
  // acquisition reportedly priced ≈6% of AUM). Stored as a percentage —
  // i.e. 6 means EV = AUM × 0.06.
  aumOfMultiplePct?: Decimal.Value;
}

export interface FyAggregate {
  fy: number;
  revenue: Money;
  ebitda: Money;
  ebit: Money;
  netIncome: Money;
  // Unlevered free cash flow = net cash movement (operating + investing) for the FY
  fcf: Money;
  closingEquity: Money;
  // Average AUM during the FY (already aggregated upstream; loan-book level).
  // Optional so consumers without a book — e.g. unit tests of just the P&L
  // cascade — don't need to supply it.
  aum?: Money;
}

export interface DcfHorizonValuation {
  horizonYears: number; // 1..N explicit window
  presentValueFcfs: Money; // PV of explicit FCFs
  terminalValue: Money; // Undiscounted TV at end of explicit window
  presentValueTerminal: Money;
  enterpriseValue: Money;
  equityValue: Money;
  impliedExitMultipleOnEbitda: Money; // TV / FCF_N — sanity check
  invalidReason?: string; // e.g. "WACC <= terminal growth"
}

export interface MultipleValuation {
  fy: number;
  metric: Money; // the metric the multiple is applied to (ebitda / revenue / NI)
  multiple: Money;
  enterpriseValue: Money;
  equityValue: Money;
}

export interface ValuationResult {
  fys: number[];
  aggregates: FyAggregate[];
  dcf: DcfHorizonValuation[];
  evEbitda: MultipleValuation[];
  evRevenue: MultipleValuation[];
  pe: MultipleValuation[];
  pb: MultipleValuation[];
  evAum: MultipleValuation[];
  assumptions: {
    waccPct: Money;
    terminalGrowthPct: Money;
    evEbitdaMultiple: Money;
    evRevenueMultiple: Money;
    peMultiple: Money;
    netDebt: Money;
    pbMultiple: Money;
    aumOfMultiplePct: Money;
  };
}

function fySum(series: MonthlyValue[], months: Set<string>): Money {
  return series.reduce<Money>(
    (acc, m) => (months.has(m.periodKey) ? acc.plus(m.value) : acc),
    ZERO as Money,
  );
}

// fyLast — get the last available value for a month set from a series
function fyLast(series: MonthlyValue[], months: string[]): Money {
  const map = new Map(series.map((m) => [m.periodKey, m.value]));
  for (let i = months.length - 1; i >= 0; i--) {
    const v = map.get(months[i]);
    if (v !== undefined) return money(v);
  }
  return ZERO as Money;
}

export interface StatementInputs {
  revenueTotals: MonthlyValue[];
  ebitda: MonthlyValue[];
  ebit: MonthlyValue[];
  netIncome: MonthlyValue[];
  netCashMovement: MonthlyValue[];
  equity: MonthlyValue[];
  // Optional per-FY average AUM (already aggregated). Index must align with
  // `groups` passed to buildFyAggregates / computeValuation.
  aumByYear?: Decimal.Value[];
}

export function buildFyAggregates(groups: FYGroup[], s: StatementInputs): FyAggregate[] {
  return groups.map((g, i) => {
    const months = new Set(g.months);
    return {
      fy: g.fy,
      revenue: fySum(s.revenueTotals, months),
      ebitda: fySum(s.ebitda, months),
      ebit: fySum(s.ebit, months),
      netIncome: fySum(s.netIncome, months),
      fcf: fySum(s.netCashMovement, months),
      closingEquity: fyLast(s.equity, g.months),
      aum: s.aumByYear?.[i] !== undefined ? money(s.aumByYear[i]) : undefined,
    };
  });
}

function computeDcfForHorizon(
  aggregates: FyAggregate[],
  horizonYears: number,
  wacc: Money,
  terminalGrowth: Money,
  netDebt: Money,
): DcfHorizonValuation {
  const explicit = aggregates.slice(0, horizonYears);
  let pvFcfs: Money = ZERO as Money;
  for (let i = 0; i < explicit.length; i++) {
    const year = i + 1;
    const fcf = explicit[i].fcf;
    const discount = money(1).plus(wacc).pow(year);
    pvFcfs = pvFcfs.plus(fcf.div(discount));
  }

  const lastFcf = explicit.length > 0 ? explicit[explicit.length - 1].fcf : (ZERO as Money);
  const lastEbitda = explicit.length > 0 ? explicit[explicit.length - 1].ebitda : (ZERO as Money);

  let terminalValue: Money = ZERO as Money;
  let invalidReason: string | undefined;
  if (wacc.lte(terminalGrowth)) {
    invalidReason = "WACC must exceed terminal growth";
  } else {
    // Gordon growth: TV = FCF_N × (1+g) / (WACC − g)
    terminalValue = lastFcf.times(money(1).plus(terminalGrowth)).div(wacc.minus(terminalGrowth));
  }

  const discountForTerminal = money(1).plus(wacc).pow(horizonYears);
  const pvTerminal = terminalValue.div(discountForTerminal);

  const ev = pvFcfs.plus(pvTerminal);
  const equity = ev.minus(netDebt);

  const impliedExitMultiple = lastEbitda.gt(0) ? terminalValue.div(lastEbitda) : (ZERO as Money);

  return {
    horizonYears,
    presentValueFcfs: pvFcfs,
    terminalValue,
    presentValueTerminal: pvTerminal,
    enterpriseValue: ev,
    equityValue: equity,
    impliedExitMultipleOnEbitda: impliedExitMultiple,
    invalidReason,
  };
}

export function computeValuation(
  groups: FYGroup[],
  s: StatementInputs,
  assumptions: ValuationAssumptions,
): ValuationResult {
  const aggregates = buildFyAggregates(groups, s);

  const wacc = money(assumptions.waccPct ?? 12).div(100); // default 12%
  const terminalGrowth = money(assumptions.terminalGrowthPct ?? 2.5).div(100);
  const evEbitdaMult = money(assumptions.evEbitdaMultiple ?? 10);
  const evRevenueMult = money(assumptions.evRevenueMultiple ?? 4);
  const peMult = money(assumptions.peMultiple ?? 15);
  const netDebt = money(assumptions.netDebt ?? 0);
  const pbMult = money(assumptions.pbMultiple ?? 1.4);
  // Default 6% — references the HPS / BlackRock acquisition headline price.
  const aumPct = money(assumptions.aumOfMultiplePct ?? 6);

  const dcf: DcfHorizonValuation[] = aggregates.map((_, i) =>
    computeDcfForHorizon(aggregates, i + 1, wacc, terminalGrowth, netDebt),
  );

  const evEbitda: MultipleValuation[] = aggregates.map((a) => {
    const ev = a.ebitda.times(evEbitdaMult);
    return {
      fy: a.fy,
      metric: a.ebitda,
      multiple: evEbitdaMult,
      enterpriseValue: ev,
      equityValue: ev.minus(netDebt),
    };
  });
  const evRevenue: MultipleValuation[] = aggregates.map((a) => {
    const ev = a.revenue.times(evRevenueMult);
    return {
      fy: a.fy,
      metric: a.revenue,
      multiple: evRevenueMult,
      enterpriseValue: ev,
      equityValue: ev.minus(netDebt),
    };
  });
  const pe: MultipleValuation[] = aggregates.map((a) => {
    const equity = a.netIncome.times(peMult);
    return {
      fy: a.fy,
      metric: a.netIncome,
      multiple: peMult,
      // P/E gives equity directly; EV would be equity + netDebt
      enterpriseValue: equity.plus(netDebt),
      equityValue: equity,
    };
  });

  const pb: MultipleValuation[] = aggregates.map((a) => {
    const equity = a.closingEquity.times(pbMult);
    return {
      fy: a.fy,
      metric: a.closingEquity,
      multiple: pbMult,
      enterpriseValue: equity.plus(netDebt),
      equityValue: equity,
    };
  });

  const aumFraction = aumPct.div(100);
  const evAum: MultipleValuation[] = aggregates.map((a) => {
    const aum = a.aum ?? (ZERO as Money);
    const ev = aum.times(aumFraction);
    return {
      fy: a.fy,
      metric: aum,
      multiple: aumPct, // display as a percentage (6 → "6%")
      enterpriseValue: ev,
      equityValue: ev.minus(netDebt),
    };
  });

  return {
    fys: aggregates.map((a) => a.fy),
    aggregates,
    dcf,
    evEbitda,
    evRevenue,
    pe,
    pb,
    evAum,
    assumptions: {
      waccPct: wacc.times(100),
      terminalGrowthPct: terminalGrowth.times(100),
      evEbitdaMultiple: evEbitdaMult,
      evRevenueMultiple: evRevenueMult,
      peMultiple: peMult,
      netDebt,
      pbMultiple: pbMult,
      aumOfMultiplePct: aumPct,
    },
  };
}
