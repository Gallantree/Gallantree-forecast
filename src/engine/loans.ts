import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import { periodKey } from "@/constants/periods";
import type { MonthlyValue } from "./pnl";

export type ProgramType = "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";

export interface LoanInput {
  id: string;
  loanId: string;
  // Capital program this loan is assigned to. Loans without a program are
  // excluded from revenue upstream (see engine/inputs.ts).
  capitalProgramId: string;
  // Resolved from the program's type (or an explicit per-program override).
  accountCode: string;
  balance: Decimal.Value;
  originationPeriodKey: string;
  maturityPeriodKey: string;
  // Spread over the scenario base rate. All-in interest rate = base + spread.
  creditSpreadBps: number;
}

// Default revenue account by program type.
export const PROGRAM_TYPE_ACCOUNT: Record<ProgramType, string> = {
  CRE_CLO: "4100",
  CMBS: "4200",
  WAREHOUSE: "4300",
  MIT_FUND: "4400",
  OTHER: "4400",
};

export function dateToPeriodKey(d: Date): string {
  return periodKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/**
 * Compute the growth factor at horizon-month `i` given a per-year growth
 * schedule. Year `k` starts at month `12k`. Years beyond the schedule
 * contribute 0% (flat balance).
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

/**
 * Project monthly gross interest revenue for a loan. All-in rate =
 * baseRateBps + loan.creditSpreadBps. Mirrors the liability projection model
 * so both sides of the book scale identically with the base rate.
 */
export function projectLoanRevenue(
  loan: LoanInput,
  horizon: string[],
  baseRateBps: Decimal.Value = 0,
  bookGrowthPctByYear: Decimal.Value[] = [],
): MonthlyValue[] {
  const allInBps = money(baseRateBps).plus(loan.creditSpreadBps);
  if (allInBps.lte(0)) {
    return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  }
  // monthly gross interest = balance × allInBps / 10000 / 12
  const monthly: Money = money(loan.balance).times(allInBps).div(10000).div(12);

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
