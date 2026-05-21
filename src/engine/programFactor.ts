import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export interface ProgramRampProfile {
  startPeriodKey: string;
  endPeriodKey?: string;
  // Stepped monthly fill: during the first N months from startPeriodKey, the
  // deal balance ramps in equal increments. Month i (0-indexed) sits at
  // (i+1)/N of full size; from month N onward the deal is fully drawn.
  rampUpMonths?: number;
  // Linear paydown: during the final N months before (and including)
  // endPeriodKey, the deal balance amortises down. Month i (0-indexed from
  // the start of the amort window) sits at (N-i)/N of full size; after
  // endPeriodKey the balance is zero.
  amortisationMonths?: number;
}

function monthsBetween(from: string, to: string): number {
  // periodKeys are YYYY-MM. Difference in months, signed.
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/**
 * Deal balance factor in [0, 1] for a single period. Combines ramp-up and
 * amortisation phases. Returns 0 outside the program's active window.
 */
export function programBalanceFactor(periodKey: string, p: ProgramRampProfile): Money {
  if (periodKey.localeCompare(p.startPeriodKey) < 0) return ZERO as Money;
  if (p.endPeriodKey && periodKey.localeCompare(p.endPeriodKey) > 0) return ZERO as Money;

  const idx = monthsBetween(p.startPeriodKey, periodKey);
  const ramp = p.rampUpMonths && p.rampUpMonths > 0 ? Math.floor(p.rampUpMonths) : 0;
  const amort =
    p.endPeriodKey && p.amortisationMonths && p.amortisationMonths > 0
      ? Math.floor(p.amortisationMonths)
      : 0;

  // Ramp-up factor (1 if past ramp window or no ramp configured).
  const rampFactor = ramp > 0 && idx < ramp ? money(idx + 1).div(ramp) : money(1);

  // Amortisation factor.
  let amortFactor: Money = money(1);
  if (amort > 0 && p.endPeriodKey) {
    const endIdx = monthsBetween(p.startPeriodKey, p.endPeriodKey);
    const amortStartIdx = endIdx - amort + 1;
    if (idx >= amortStartIdx) {
      const intoAmort = idx - amortStartIdx; // 0..amort-1
      amortFactor = money(amort - intoAmort).div(amort);
    }
  }

  // If both phases overlap (very short deal) take the smaller — never above 1.
  return rampFactor.lte(amortFactor) ? rampFactor : amortFactor;
}

export function programBalanceFactorSeries(
  horizon: string[],
  p: ProgramRampProfile,
): MonthlyValue[] {
  return horizon.map((pk) => ({ periodKey: pk, value: programBalanceFactor(pk, p) }));
}
