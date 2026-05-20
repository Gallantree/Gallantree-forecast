import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export type CapitalRaiseKind = "equity" | "convertible_note";
export type CapitalRaiseInvestorStatus = "committed" | "funded" | "withdrawn";

export interface CapitalRaiseInvestorInput {
  id: string;
  name: string;
  commitment: string;
  fundingPeriodKey: string; // YYYY-MM derived from the investor's fundingDate
  status: CapitalRaiseInvestorStatus;
}

export interface CapitalRaiseInput {
  id: string;
  name: string;
  kind: CapitalRaiseKind;
  investors: CapitalRaiseInvestorInput[];
}

// Sum of investor commitments hitting the cash account, by period.
// Withdrawn investors are excluded; committed + funded both count toward the
// forecast (committed is the projected inflow, funded is the realised one).
function projectKind(
  raises: CapitalRaiseInput[],
  horizon: string[],
  kind: CapitalRaiseKind,
): MonthlyValue[] {
  return horizon.map((pk) => {
    let acc: Money = ZERO as Money;
    for (const r of raises) {
      if (r.kind !== kind) continue;
      for (const inv of r.investors) {
        if (inv.status === "withdrawn") continue;
        if (inv.fundingPeriodKey === pk) acc = acc.plus(money(inv.commitment));
      }
    }
    return { periodKey: pk, value: acc };
  });
}

export function projectEquityProceeds(
  raises: CapitalRaiseInput[],
  horizon: string[],
): MonthlyValue[] {
  return projectKind(raises, horizon, "equity");
}

export function projectConvertibleProceeds(
  raises: CapitalRaiseInput[],
  horizon: string[],
): MonthlyValue[] {
  return projectKind(raises, horizon, "convertible_note");
}
