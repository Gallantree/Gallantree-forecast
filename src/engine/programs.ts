import type Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";
import { programBalanceFactor } from "./programFactor";

export type FeeCategory = "senior_mgmt" | "subordinate_mgmt" | "servicing" | "other";

export interface ProgramFeeInput {
  id: string;
  programId: string;
  programName: string;
  programType: string;
  feeName: string;
  category: FeeCategory;
  basisAmount: Decimal.Value;
  feeBps: number;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  // Share of this fee that Gallantree retains as revenue (decimal fraction).
  // Only meaningful for servicing fees, where Gallantree typically keeps
  // ~33% and the rest passes through to the originator/trustee. Absent →
  // 1.0 for non-servicing, 0.33 for servicing.
  gallantreeSharePct?: Decimal.Value;
  // Program-level ramp/amort profile. Scales the fee basis (which is balance-
  // pegged) so management/servicing fees during ramp and tail-amort match the
  // partially-drawn book.
  rampUpMonths?: number;
  amortisationMonths?: number;
}

export const DEFAULT_SERVICING_SHARE = 0.33;

export const DEFAULT_FEE_ACCOUNT: Record<FeeCategory, string> = {
  senior_mgmt: "4500",
  subordinate_mgmt: "4510",
  servicing: "4520",
  other: "4530",
};

function isActive(periodKey: string, start: string, end: string | undefined): boolean {
  if (periodKey.localeCompare(start) < 0) return false;
  if (end && periodKey.localeCompare(end) > 0) return false;
  return true;
}

export function projectProgramFee(fee: ProgramFeeInput, horizon: string[]): MonthlyValue[] {
  // Annualised fee = basisAmount × bps/10000; spread evenly across 12 months.
  // Servicing fees get scaled by Gallantree's share (default 33%) — the rest
  // passes through to the originator/trustee and is not Gallantree revenue.
  const share =
    fee.category === "servicing"
      ? money(fee.gallantreeSharePct ?? DEFAULT_SERVICING_SHARE)
      : money(fee.gallantreeSharePct ?? 1);
  const monthly: Money = money(fee.basisAmount).times(fee.feeBps).div(10000).times(share).div(12);
  const hasProfile = !!(fee.rampUpMonths || fee.amortisationMonths);
  return horizon.map((pk) => {
    if (!isActive(pk, fee.startPeriodKey, fee.endPeriodKey)) {
      return { periodKey: pk, value: ZERO as Money };
    }
    if (!hasProfile) return { periodKey: pk, value: monthly };
    const factor = programBalanceFactor(pk, {
      startPeriodKey: fee.startPeriodKey,
      endPeriodKey: fee.endPeriodKey,
      rampUpMonths: fee.rampUpMonths,
      amortisationMonths: fee.amortisationMonths,
    });
    return { periodKey: pk, value: monthly.times(factor) };
  });
}
