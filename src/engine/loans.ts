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

export function projectLoanRevenue(
  loan: LoanInput,
  horizon: string[],
  tier: NimTier,
): MonthlyValue[] {
  const nimBps = nimBpsForTier(loan, tier);
  if (nimBps === 0) {
    return horizon.map((pk) => ({ periodKey: pk, value: ZERO as Money }));
  }
  // monthly revenue = balance × NIM(bps)/10000 / 12
  const monthly: Money = money(loan.balance).times(nimBps).div(10000).div(12);
  return horizon.map((pk) => {
    const isActive =
      pk.localeCompare(loan.originationPeriodKey) >= 0 &&
      pk.localeCompare(loan.maturityPeriodKey) <= 0;
    return { periodKey: pk, value: isActive ? monthly : (ZERO as Money) };
  });
}
