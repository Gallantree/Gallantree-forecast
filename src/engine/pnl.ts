import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import { periodKey } from "@/constants/periods";

interface DriverBase {
  id: string;
  name: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
}

export interface RecurringRevenueDriverInput extends DriverBase {
  kind: "recurring_revenue";
  baseMonthly: Decimal.Value;
  monthlyGrowthPct: Decimal.Value;
}
export interface OpexFixedDriverInput extends DriverBase {
  kind: "opex_fixed";
  baseMonthly: Decimal.Value;
  monthlyGrowthPct: Decimal.Value;
}
export interface OpexPctRevenueDriverInput extends DriverBase {
  kind: "opex_pct_revenue";
  pctOfRevenue: Decimal.Value;
}

export type DriverInput =
  | RecurringRevenueDriverInput
  | OpexFixedDriverInput
  | OpexPctRevenueDriverInput;

export interface HeadcountInput {
  id: string;
  role: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: Decimal.Value;
  onCostPct: Decimal.Value;
  salaryGrowthPctAnnual: Decimal.Value;
}

export interface MonthlyValue {
  periodKey: string;
  value: Money;
}

export interface PnLLine {
  accountCode: string;
  driverIds: string[];
  monthly: MonthlyValue[];
  total: Money;
}

export interface PnLSection {
  lines: PnLLine[];
  totals: MonthlyValue[];
  total: Money;
}

export interface PnL {
  horizon: string[];
  revenue: PnLSection;
  opex: PnLSection;
  grossProfit: MonthlyValue[];
  grossProfitTotal: Money;
}

export function buildHorizon(startYear: number, startMonth: number, months: number): string[] {
  const keys: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < months; i++) {
    keys.push(periodKey(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function activeIndex(
  horizon: string[],
  startKey: string,
  endKey: string | undefined,
  pk: string,
): number {
  if (pk.localeCompare(startKey) < 0) return -1;
  if (endKey && pk.localeCompare(endKey) > 0) return -1;
  return horizon.indexOf(pk) - horizon.indexOf(startKey);
}

function compoundedMonthly(
  base: Decimal.Value,
  monthlyGrowthPct: Decimal.Value,
  monthsFromStart: number,
): Money {
  const growth = money(monthlyGrowthPct).div(100);
  const factor = money(1).plus(growth).pow(monthsFromStart);
  return money(base).times(factor);
}

export function projectRecurringRevenue(
  d: RecurringRevenueDriverInput,
  horizon: string[],
): MonthlyValue[] {
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    return {
      periodKey: pk,
      value: idx < 0 ? ZERO : compoundedMonthly(d.baseMonthly, d.monthlyGrowthPct, idx),
    };
  });
}

export function projectOpexFixed(
  d: OpexFixedDriverInput,
  horizon: string[],
): MonthlyValue[] {
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    return {
      periodKey: pk,
      value: idx < 0 ? ZERO : compoundedMonthly(d.baseMonthly, d.monthlyGrowthPct, idx),
    };
  });
}

export function projectOpexPctRevenue(
  d: OpexPctRevenueDriverInput,
  horizon: string[],
  revenueTotals: MonthlyValue[],
): MonthlyValue[] {
  const pct = money(d.pctOfRevenue).div(100);
  return horizon.map((pk, i) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    return { periodKey: pk, value: revenueTotals[i].value.times(pct) };
  });
}

export function projectHeadcount(h: HeadcountInput, horizon: string[]): MonthlyValue[] {
  const monthlyBase = money(h.salaryAnnual).div(12);
  const onCost = money(1).plus(money(h.onCostPct).div(100));
  const annualGrowth = money(1).plus(money(h.salaryGrowthPctAnnual).div(100));
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, h.startPeriodKey, h.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    const years = new Decimal(idx).div(12);
    const growthFactor = annualGrowth.pow(years);
    return { periodKey: pk, value: monthlyBase.times(onCost).times(growthFactor) };
  });
}

function groupByAccount(
  drivers: { id: string; accountCode: string; monthly: MonthlyValue[] }[],
  horizon: string[],
): PnLLine[] {
  const byAccount = new Map<string, { ids: string[]; monthly: Money[] }>();
  for (const d of drivers) {
    const bucket = byAccount.get(d.accountCode) ?? {
      ids: [],
      monthly: horizon.map(() => ZERO as Money),
    };
    bucket.ids.push(d.id);
    for (let i = 0; i < horizon.length; i++) {
      bucket.monthly[i] = bucket.monthly[i].plus(d.monthly[i].value);
    }
    byAccount.set(d.accountCode, bucket);
  }
  return Array.from(byAccount.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountCode, bucket]) => ({
      accountCode,
      driverIds: bucket.ids,
      monthly: horizon.map((pk, i) => ({ periodKey: pk, value: bucket.monthly[i] })),
      total: bucket.monthly.reduce((acc, v) => acc.plus(v), ZERO as Money),
    }));
}

function sectionFromLines(lines: PnLLine[], horizon: string[]): PnLSection {
  const totals: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: lines.reduce((acc, l) => acc.plus(l.monthly[i].value), ZERO as Money),
  }));
  return {
    lines,
    totals,
    total: totals.reduce((acc, m) => acc.plus(m.value), ZERO as Money),
  };
}

export function computePnL(
  drivers: DriverInput[],
  headcount: HeadcountInput[],
  horizon: string[],
): PnL {
  const revenueDrivers = drivers.filter(
    (d): d is RecurringRevenueDriverInput => d.kind === "recurring_revenue",
  );
  const opexFixed = drivers.filter((d): d is OpexFixedDriverInput => d.kind === "opex_fixed");
  const opexPct = drivers.filter(
    (d): d is OpexPctRevenueDriverInput => d.kind === "opex_pct_revenue",
  );

  const revenueProjected = revenueDrivers.map((d) => ({
    id: d.id,
    accountCode: d.accountCode,
    monthly: projectRecurringRevenue(d, horizon),
  }));
  const revenueLines = groupByAccount(revenueProjected, horizon);
  const revenue = sectionFromLines(revenueLines, horizon);

  const fixedProjected = opexFixed.map((d) => ({
    id: d.id,
    accountCode: d.accountCode,
    monthly: projectOpexFixed(d, horizon),
  }));
  const pctProjected = opexPct.map((d) => ({
    id: d.id,
    accountCode: d.accountCode,
    monthly: projectOpexPctRevenue(d, horizon, revenue.totals),
  }));
  const headcountProjected = headcount.map((h) => ({
    id: h.id,
    accountCode: h.accountCode,
    monthly: projectHeadcount(h, horizon),
  }));
  const opexLines = groupByAccount(
    [...fixedProjected, ...pctProjected, ...headcountProjected],
    horizon,
  );
  const opex = sectionFromLines(opexLines, horizon);

  const grossProfit: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: revenue.totals[i].value.minus(opex.totals[i].value),
  }));
  const grossProfitTotal = grossProfit.reduce((acc, m) => acc.plus(m.value), ZERO as Money);

  return { horizon, revenue, opex, grossProfit, grossProfitTotal };
}
