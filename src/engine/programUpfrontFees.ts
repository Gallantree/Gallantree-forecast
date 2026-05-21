import type Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export type UpfrontFeeCategory = "underwriter" | "legal" | "credit_rating" | "other";

export interface ProgramUpfrontFeeInput {
  id: string;
  programId: string;
  programName: string;
  feeName: string;
  category: UpfrontFeeCategory;
  amount: Decimal.Value;
  accountCode: string;
  // Program window. The fee is paid in full at startPeriodKey and amortised
  // straight-line across all active program periods. With no endPeriodKey the
  // fee is expensed in full at startPeriodKey (no amortisation).
  startPeriodKey: string;
  endPeriodKey?: string;
}

export const DEFAULT_UPFRONT_FEE_ACCOUNT = "6900";

function activeMonths(horizon: string[], start: string, end?: string): number {
  let count = 0;
  for (const pk of horizon) {
    if (pk.localeCompare(start) < 0) continue;
    if (end && pk.localeCompare(end) > 0) continue;
    count++;
  }
  return count;
}

/**
 * Straight-line amortisation of an upfront fee across the program's active
 * horizon. With no endPeriodKey the full amount is expensed at startPeriodKey.
 */
export function projectUpfrontFeeAmortisation(
  fee: ProgramUpfrontFeeInput,
  horizon: string[],
): MonthlyValue[] {
  const total = money(fee.amount);
  if (total.lte(0)) return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  if (!fee.endPeriodKey) {
    return horizon.map((pk) => ({
      periodKey: pk,
      value: pk === fee.startPeriodKey ? total : (ZERO as Money),
    }));
  }
  const months = activeMonths(horizon, fee.startPeriodKey, fee.endPeriodKey);
  if (months === 0) return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  const per = total.div(months);
  return horizon.map((pk) => {
    const isActive =
      pk.localeCompare(fee.startPeriodKey) >= 0 && pk.localeCompare(fee.endPeriodKey!) <= 0;
    return { periodKey: pk, value: isActive ? per : (ZERO as Money) };
  });
}

/**
 * Cash purchase schedule — full amount paid at startPeriodKey, 0 elsewhere.
 */
export function projectUpfrontFeeCashOutflow(
  fee: ProgramUpfrontFeeInput,
  horizon: string[],
): MonthlyValue[] {
  const total = money(fee.amount);
  return horizon.map((pk) => ({
    periodKey: pk,
    value: pk === fee.startPeriodKey ? total : (ZERO as Money),
  }));
}
