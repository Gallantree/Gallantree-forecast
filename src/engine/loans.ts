import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import { periodKey } from "@/constants/periods";
import type { MonthlyValue } from "./pnl";

export type NimTier = "default" | "neg_floor" | "hard_floor";

export interface LoanInput {
  id: string;
  loanId: string;
  channel: "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";
  balance: Decimal.Value;
  originationPeriodKey: string;
  maturityPeriodKey: string;
  nimDefaultBps?: number;
  nimNegFloorBps?: number;
  nimHardFloorBps?: number;
}

export const CHANNEL_ACCOUNT: Record<LoanInput["channel"], string> = {
  CRE_CLO: "4100",
  CMBS: "4200",
  Warehouse: "4300",
  "Non-Conforming": "4400",
};

export function dateToPeriodKey(d: Date): string {
  return periodKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

function nimBpsForTier(loan: LoanInput, tier: NimTier): number {
  switch (tier) {
    case "default":
      return loan.nimDefaultBps ?? 0;
    case "neg_floor":
      return loan.nimNegFloorBps ?? loan.nimDefaultBps ?? 0;
    case "hard_floor":
      return loan.nimHardFloorBps ?? loan.nimNegFloorBps ?? loan.nimDefaultBps ?? 0;
  }
}

/**
 * Compute the growth factor at horizon-month `i` given a per-year growth
 * schedule. Year `k` (0-indexed) starts at month `12k` and ends at month
 * `12k + 11`. The factor at the START of year k equals the cumulative product
 * of (1 + rate[0..k-1]); within a year we interpolate via (1 + rate[k])^(j/12)
 * where j ∈ [0, 12). Years beyond the schedule contribute 0% (no growth).
 */
function growthFactorAt(
  monthIndex: number,
  rates: Money[],
  prefixProduct: Money[],
): Money {
  const year = Math.floor(monthIndex / 12);
  const monthInYear = monthIndex % 12;
  const yearStart =
    year < prefixProduct.length ? prefixProduct[year] : prefixProduct[prefixProduct.length - 1];
  const yearRate = year < rates.length ? rates[year] : (ZERO as Money);
  if (yearRate.eq(0)) return yearStart;
  const fraction = new Decimal(monthInYear).div(12);
  return yearStart.times(money(1).plus(yearRate).pow(fraction));
}

export function projectLoanRevenue(
  loan: LoanInput,
  horizon: string[],
  tier: NimTier,
  bookGrowthPctByYear: Decimal.Value[] = [],
): MonthlyValue[] {
  const nimBps = nimBpsForTier(loan, tier);
  if (nimBps === 0) {
    return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  }
  // monthly revenue = balance × NIM(bps)/10000 / 12
  const monthly: Money = money(loan.balance).times(nimBps).div(10000).div(12);

  // Pre-compute year-start cumulative growth factor so each month projection
  // is O(1). prefixProduct[k] = factor at start of year k (1 at year 0).
  const rates = bookGrowthPctByYear.map((v) => money(v).div(100));
  const prefixProduct: Money[] = [money(1)];
  for (let k = 0; k < rates.length; k++) {
    prefixProduct.push(prefixProduct[k].times(money(1).plus(rates[k])));
  }

  const noGrowth = rates.every((r) => r.eq(0));
  return horizon.map((pk, i) => {
    const isActive =
      pk.localeCompare(loan.originationPeriodKey) >= 0 &&
      pk.localeCompare(loan.maturityPeriodKey) <= 0;
    if (!isActive) return { periodKey: pk, value: ZERO as Money };
    if (noGrowth) return { periodKey: pk, value: monthly };
    const factor = growthFactorAt(i, rates, prefixProduct);
    return { periodKey: pk, value: monthly.times(factor) };
  });
}
