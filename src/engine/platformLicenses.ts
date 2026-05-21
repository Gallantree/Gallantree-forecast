import Decimal from "decimal.js";
import { type Money, money, ZERO } from "@/utils/money";
import type { MonthlyValue } from "./pnl";

export type LicenseType = "compliance" | "trustee";

export interface ComplianceLicenseInput {
  id: string;
  name: string;
  type: "compliance";
  startPeriodKey: string;
  endPeriodKey?: string;
  accountCode?: string;
  monthlyFeePerSeat: Decimal.Value;
  seatCount: number;
  seatGrowthPctAnnual?: Decimal.Value;
  billingFrequency?: "monthly" | "annual";
  annualDiscountPct?: Decimal.Value;
}

export interface TrusteeLicenseInput {
  id: string;
  name: string;
  type: "trustee";
  startPeriodKey: string;
  endPeriodKey?: string;
  accountCode?: string;
  monthlyFee: Decimal.Value;
  configFee?: Decimal.Value;
  aumByYear: Decimal.Value[];
  feePctOfAumByYear: Decimal.Value[];
}

export type PlatformLicenseInput = ComplianceLicenseInput | TrusteeLicenseInput;

export const LICENSE_ACCOUNT: Record<LicenseType, string> = {
  compliance: "4600",
  trustee: "4610",
};

function isActive(periodKey: string, start: string, end: string | undefined): boolean {
  if (periodKey.localeCompare(start) < 0) return false;
  if (end && periodKey.localeCompare(end) > 0) return false;
  return true;
}

function monthsBetween(from: string, to: string): number {
  // periodKeys are YYYY-MM. Signed month difference.
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function projectComplianceLicense(
  l: ComplianceLicenseInput,
  horizon: string[],
): MonthlyValue[] {
  const baseMonthly = money(l.monthlyFeePerSeat);
  const seats = money(l.seatCount);
  const discount =
    l.billingFrequency === "annual" && l.annualDiscountPct
      ? money(1).minus(money(l.annualDiscountPct).div(100))
      : money(1);
  // Revenue recognition is monthly even when billed annually; the discount
  // reduces the effective per-month rate.
  const effective = baseMonthly.times(discount).times(seats);
  const growthAnnual = money(l.seatGrowthPctAnnual ?? 0).div(100);
  const startIdx = horizon.indexOf(l.startPeriodKey);
  return horizon.map((pk, i) => {
    if (!isActive(pk, l.startPeriodKey, l.endPeriodKey))
      return { periodKey: pk, value: ZERO as Money };
    if (growthAnnual.eq(0) || startIdx < 0) return { periodKey: pk, value: effective };
    const monthsFromStart = i - startIdx;
    const years = new Decimal(monthsFromStart).div(12);
    const factor = money(1).plus(growthAnnual).pow(years);
    return { periodKey: pk, value: effective.times(factor) };
  });
}

export function projectTrusteeLicense(l: TrusteeLicenseInput, horizon: string[]): MonthlyValue[] {
  const monthlyFee = money(l.monthlyFee);
  const configFee = money(l.configFee ?? 0);
  const aumYearly = l.aumByYear.map((v) => money(v));
  const feeYearly = l.feePctOfAumByYear.map((v) => money(v).div(100));
  const startIdx = horizon.indexOf(l.startPeriodKey);

  function aumAt(yearIdx: number): Money {
    if (aumYearly.length === 0) return ZERO as Money;
    if (yearIdx < aumYearly.length) return aumYearly[yearIdx];
    return aumYearly[aumYearly.length - 1];
  }
  function feePctAt(yearIdx: number): Money {
    if (feeYearly.length === 0) return ZERO as Money;
    if (yearIdx < feeYearly.length) return feeYearly[yearIdx];
    return feeYearly[feeYearly.length - 1];
  }

  return horizon.map((pk, i) => {
    if (!isActive(pk, l.startPeriodKey, l.endPeriodKey))
      return { periodKey: pk, value: ZERO as Money };
    const monthsFromStart = startIdx < 0 ? 0 : i - startIdx;
    const yearIdx = Math.floor(monthsFromStart / 12);
    // Monthly AUM-based fee = AUM × pct / 12
    const aumFee = aumAt(yearIdx).times(feePctAt(yearIdx)).div(12);
    // Config fee only in the start period
    const oneOff = pk === l.startPeriodKey ? configFee : (ZERO as Money);
    return { periodKey: pk, value: monthlyFee.plus(aumFee).plus(oneOff) };
  });
}

export function projectPlatformLicense(l: PlatformLicenseInput, horizon: string[]): MonthlyValue[] {
  if (l.type === "compliance") return projectComplianceLicense(l, horizon);
  return projectTrusteeLicense(l, horizon);
}

// Cash billings per period — when the customer is invoiced. For monthly billing
// this matches recognition; for annual billing it lumps 12 months of recognised
// revenue into the anniversary month (start, +12, +24, …). The gap between
// billings and recognition is deferred revenue (a current liability).
export function projectLicenseBillings(l: PlatformLicenseInput, horizon: string[]): MonthlyValue[] {
  const recognised = projectPlatformLicense(l, horizon);
  if (l.type !== "compliance" || l.billingFrequency !== "annual") return recognised;
  // Anchor anniversaries to the license's startPeriodKey, not to its position
  // within the horizon — a license that began before the horizon still has
  // anniversary billings that fall inside it.
  return horizon.map((pk, i) => {
    if (!isActive(pk, l.startPeriodKey, l.endPeriodKey))
      return { periodKey: pk, value: ZERO as Money };
    const monthsFromStart = monthsBetween(l.startPeriodKey, pk);
    if (monthsFromStart < 0) return { periodKey: pk, value: ZERO as Money };
    if (monthsFromStart % 12 !== 0) return { periodKey: pk, value: ZERO as Money };
    let billing = ZERO as Money;
    for (let k = 0; k < 12; k++) {
      const j = i + k;
      if (j >= horizon.length) break;
      if (!isActive(horizon[j], l.startPeriodKey, l.endPeriodKey)) break;
      billing = billing.plus(recognised[j].value);
    }
    return { periodKey: pk, value: billing };
  });
}

export function licenseAccount(l: PlatformLicenseInput): string {
  return l.accountCode ?? LICENSE_ACCOUNT[l.type];
}
