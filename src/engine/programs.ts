import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

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
}

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

export function projectProgramFee(
  fee: ProgramFeeInput,
  horizon: string[],
): MonthlyValue[] {
  // Annualised fee = basisAmount × bps/10000; spread evenly across 12 months.
  const monthly: Money = money(fee.basisAmount).times(fee.feeBps).div(10000).div(12);
  return horizon.map((pk) => ({
    periodKey: pk,
    value: isActive(pk, fee.startPeriodKey, fee.endPeriodKey)
      ? monthly
      : (ZERO as Money),
  }));
}
