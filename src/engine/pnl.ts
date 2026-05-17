import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import { periodKey } from "@/constants/periods";

export interface RecurringRevenueDriverInput {
  id: string;
  name: string;
  accountCode: string;
  startPeriodKey: string;
  baseMonthly: Decimal.Value;
  monthlyGrowthPct: Decimal.Value;
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

export interface PnL {
  horizon: string[];
  lines: PnLLine[];
  revenueTotal: Money;
}

function comparePeriodKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function projectRecurringRevenue(
  driver: RecurringRevenueDriverInput,
  horizon: string[],
): MonthlyValue[] {
  const base = money(driver.baseMonthly);
  const growth = money(driver.monthlyGrowthPct).div(100);
  return horizon.map((pk) => {
    if (comparePeriodKeys(pk, driver.startPeriodKey) < 0) {
      return { periodKey: pk, value: ZERO };
    }
    const idx = horizon.indexOf(pk) - horizon.indexOf(driver.startPeriodKey);
    const factor = money(1).plus(growth).pow(idx);
    return { periodKey: pk, value: base.times(factor) };
  });
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

export function computePnL(
  drivers: RecurringRevenueDriverInput[],
  horizon: string[],
): PnL {
  const byAccount = new Map<string, { ids: string[]; monthly: Money[] }>();
  for (const driver of drivers) {
    const series = projectRecurringRevenue(driver, horizon);
    const bucket = byAccount.get(driver.accountCode) ?? {
      ids: [],
      monthly: horizon.map(() => ZERO),
    };
    bucket.ids.push(driver.id);
    for (let i = 0; i < horizon.length; i++) {
      bucket.monthly[i] = bucket.monthly[i].plus(series[i].value);
    }
    byAccount.set(driver.accountCode, bucket);
  }
  const lines: PnLLine[] = Array.from(byAccount.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountCode, bucket]) => ({
      accountCode,
      driverIds: bucket.ids,
      monthly: horizon.map((pk, i) => ({ periodKey: pk, value: bucket.monthly[i] })),
      total: bucket.monthly.reduce((acc, v) => acc.plus(v), ZERO),
    }));
  const revenueTotal = lines.reduce((acc, l) => acc.plus(l.total), ZERO);
  return { horizon, lines, revenueTotal };
}
