import Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";
import { programBalanceFactor } from "./programFactor";

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
  // Program-level ramp/amort profile. The note balance and interest expense
  // both scale by the deal-balance factor — notes are issued in step with the
  // ramp and repaid in step with tail amortisation.
  rampUpMonths?: number;
  amortisationMonths?: number;
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
  const hasProfile = !!(l.rampUpMonths || l.amortisationMonths);
  return horizon.map((pk) => {
    if (!isActive(pk, l.startPeriodKey, l.endPeriodKey)) {
      return { periodKey: pk, value: ZERO as Money };
    }
    if (!hasProfile) return { periodKey: pk, value: monthly };
    const factor = programBalanceFactor(pk, {
      startPeriodKey: l.startPeriodKey,
      endPeriodKey: l.endPeriodKey,
      rampUpMonths: l.rampUpMonths,
      amortisationMonths: l.amortisationMonths,
    });
    return { periodKey: pk, value: monthly.times(factor) };
  });
}

void Decimal;
