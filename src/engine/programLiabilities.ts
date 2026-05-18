import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export type LiabilityCalculationMethod = "monthly" | "quarterly" | "annually";
export type LiabilityRateType = "fixed" | "variable";

export interface ProgramLiabilityInput {
  id: string;
  programId: string;
  programName: string;
  trancheName: string;
  principal: Decimal.Value; // numNotes × faceValuePerNote
  returnProfileBps: number; // spread
  rateType: LiabilityRateType;
  calculationMethod: LiabilityCalculationMethod;
  accountCode: string;
  startPeriodKey: string; // program startPeriodKey
  endPeriodKey?: string; // program endPeriodKey
}

export const DEFAULT_LIABILITY_ACCOUNT = "6800";

function isActive(periodKey: string, start: string, end: string | undefined): boolean {
  if (periodKey.localeCompare(start) < 0) return false;
  if (end && periodKey.localeCompare(end) > 0) return false;
  return true;
}

/**
 * Project interest expense for one tranche. Recognised straight-line monthly
 * regardless of calculationMethod (Monthly/Quarterly/Annually) — that field
 * describes payment frequency, not P&L accrual. Variable-rate tranches use
 * scenario's baseRateBps.
 */
export function projectProgramLiability(
  l: ProgramLiabilityInput,
  horizon: string[],
  baseRateBps: Decimal.Value = 0,
): MonthlyValue[] {
  const principal = money(l.principal);
  const baseBps = money(baseRateBps);
  const spread = money(l.returnProfileBps);
  const allInBps = l.rateType === "variable" ? baseBps.plus(spread) : spread;
  if (allInBps.lte(0) || principal.lte(0)) {
    return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  }
  // Monthly interest expense = principal × allInBps / 10000 / 12
  const monthly = principal.times(allInBps).div(10000).div(12);
  return horizon.map((pk) => ({
    periodKey: pk,
    value: isActive(pk, l.startPeriodKey, l.endPeriodKey)
      ? monthly
      : (ZERO as Money),
  }));
}

void Decimal;
