import Decimal from "decimal.js";
import { money, ZERO, type Money } from "@/utils/money";
import { periodKey } from "@/constants/periods";
import { projectLoanRevenue, type LoanInput } from "./loans";
import { projectProgramFee, type ProgramFeeInput } from "./programs";
import {
  licenseAccount,
  projectPlatformLicense,
  type PlatformLicenseInput,
} from "./platformLicenses";
import {
  DEFAULT_LIABILITY_ACCOUNT,
  projectProgramLiability,
  type ProgramLiabilityInput,
} from "./programLiabilities";

interface DriverBase {
  id: string;
  name: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
}

export interface RecurringRevenueDriverInput extends DriverBase {
  kind: "recurring_revenue";
  baseMonthly: Decimal.Value;
  monthlyGrowthPct: Decimal.Value;
}
export interface FeeVolumeRevenueDriverInput extends DriverBase {
  kind: "fee_x_volume";
  feeBps: Decimal.Value;
  volumeMonthly: Decimal.Value;
  volumeMonthlyGrowthPct: Decimal.Value;
}
export interface OneOffRevenueDriverInput extends DriverBase {
  kind: "one_off";
  amount: Decimal.Value;
  periodKey: string;
}
export interface OpexFixedDriverInput extends DriverBase {
  kind: "opex_fixed";
  baseMonthly: Decimal.Value;
  monthlyGrowthPct: Decimal.Value;
}
export interface OpexPctRevenueDriverInput extends DriverBase {
  kind: "opex_pct_revenue";
  pctOfRevenue: Decimal.Value;
}
export interface OpexPerFteDriverInput extends DriverBase {
  kind: "opex_per_fte";
  costPerFteMonthly: Decimal.Value;
}
export interface CapexStraightLineDriverInput extends DriverBase {
  kind: "capex_straight_line";
  cost: Decimal.Value;
  inServicePeriodKey: string;
  usefulLifeMonths: number;
}

export type DriverInput =
  | RecurringRevenueDriverInput
  | FeeVolumeRevenueDriverInput
  | OneOffRevenueDriverInput
  | OpexFixedDriverInput
  | OpexPctRevenueDriverInput
  | OpexPerFteDriverInput
  | CapexStraightLineDriverInput;

export interface HeadcountInput {
  id: string;
  personName?: string;
  role: string;
  accountCode: string;
  employmentType?: "full_time" | "part_time" | "contractor";
  ftePct?: Decimal.Value;
  band?: number;
  tier?: number;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: Decimal.Value;
  superPct?: Decimal.Value;
  onCostPct: Decimal.Value;
  salaryGrowthPctAnnual: Decimal.Value;
}

export interface MonthlyValue {
  periodKey: string;
  value: Money;
}

export interface PnLLineItem {
  id: string;
  label: string;
  source:
    | "driver"
    | "headcount"
    | "loan"
    | "program_fee"
    | "platform_license"
    | "program_liability";
  monthly: MonthlyValue[];
  total: Money;
}

export interface PnLLine {
  accountCode: string;
  driverIds: string[];
  items: PnLLineItem[];
  monthly: MonthlyValue[];
  total: Money;
}

export interface PnLSection {
  lines: PnLLine[];
  totals: MonthlyValue[];
  total: Money;
}

export interface PnL {
  horizon: string[];
  revenue: PnLSection;
  opex: PnLSection;
  // Capital program liabilities (interest expense). Reported below operating
  // income — not part of OPEX and not part of gross profit.
  liabilities: PnLSection;
  grossProfit: MonthlyValue[];
  grossProfitTotal: Money;
}

export function buildHorizon(startYear: number, startMonth: number, months: number): string[] {
  const keys: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < months; i++) {
    keys.push(periodKey(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

function activeIndex(
  horizon: string[],
  startKey: string,
  endKey: string | undefined,
  pk: string,
): number {
  if (pk.localeCompare(startKey) < 0) return -1;
  if (endKey && pk.localeCompare(endKey) > 0) return -1;
  return horizon.indexOf(pk) - horizon.indexOf(startKey);
}

function compoundedMonthly(
  base: Decimal.Value,
  monthlyGrowthPct: Decimal.Value,
  monthsFromStart: number,
): Money {
  const growth = money(monthlyGrowthPct).div(100);
  const factor = money(1).plus(growth).pow(monthsFromStart);
  return money(base).times(factor);
}

export function projectRecurringRevenue(
  d: RecurringRevenueDriverInput,
  horizon: string[],
): MonthlyValue[] {
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    return {
      periodKey: pk,
      value: idx < 0 ? ZERO : compoundedMonthly(d.baseMonthly, d.monthlyGrowthPct, idx),
    };
  });
}

export function projectOpexFixed(
  d: OpexFixedDriverInput,
  horizon: string[],
): MonthlyValue[] {
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    return {
      periodKey: pk,
      value: idx < 0 ? ZERO : compoundedMonthly(d.baseMonthly, d.monthlyGrowthPct, idx),
    };
  });
}

export function projectFeeVolumeRevenue(
  d: FeeVolumeRevenueDriverInput,
  horizon: string[],
): MonthlyValue[] {
  const bps = money(d.feeBps).div(10000);
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    const volume = compoundedMonthly(d.volumeMonthly, d.volumeMonthlyGrowthPct, idx);
    return { periodKey: pk, value: volume.times(bps) };
  });
}

export function projectOneOffRevenue(
  d: OneOffRevenueDriverInput,
  horizon: string[],
): MonthlyValue[] {
  return horizon.map((pk) => ({
    periodKey: pk,
    value: pk === d.periodKey ? money(d.amount) : ZERO,
  }));
}

export function projectOpexPerFte(
  d: OpexPerFteDriverInput,
  horizon: string[],
  fteCountByPeriod: Decimal.Value[],
): MonthlyValue[] {
  const per = money(d.costPerFteMonthly);
  return horizon.map((pk, i) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    return { periodKey: pk, value: per.times(money(fteCountByPeriod[i])) };
  });
}

export function projectCapexDepreciation(
  d: CapexStraightLineDriverInput,
  horizon: string[],
): MonthlyValue[] {
  if (d.usefulLifeMonths <= 0) {
    return horizon.map((pk) => ({ periodKey: pk, value: ZERO }));
  }
  const monthly = money(d.cost).div(d.usefulLifeMonths);
  const startIdx = horizon.indexOf(d.inServicePeriodKey);
  return horizon.map((pk, i) => {
    if (startIdx < 0) return { periodKey: pk, value: ZERO };
    const offset = i - startIdx;
    if (offset < 0 || offset >= d.usefulLifeMonths) return { periodKey: pk, value: ZERO };
    return { periodKey: pk, value: monthly };
  });
}

function activeFteCount(headcount: HeadcountInput[], horizon: string[]): Money[] {
  return horizon.map((pk) =>
    headcount.reduce<Money>(
      (acc, h) =>
        activeIndex(horizon, h.startPeriodKey, h.endPeriodKey, pk) < 0
          ? acc
          : acc.plus(money(h.ftePct ?? 1)),
      ZERO as Money,
    ),
  );
}

export function projectOpexPctRevenue(
  d: OpexPctRevenueDriverInput,
  horizon: string[],
  revenueTotals: MonthlyValue[],
): MonthlyValue[] {
  const pct = money(d.pctOfRevenue).div(100);
  return horizon.map((pk, i) => {
    const idx = activeIndex(horizon, d.startPeriodKey, d.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    return { periodKey: pk, value: revenueTotals[i].value.times(pct) };
  });
}

export function projectHeadcount(h: HeadcountInput, horizon: string[]): MonthlyValue[] {
  const fte = money(h.ftePct ?? 1);
  const monthlyBase = money(h.salaryAnnual).div(12).times(fte);
  // Super and on-cost both scale gross salary; sum then apply once.
  const loading = money(1)
    .plus(money(h.superPct ?? 0).div(100))
    .plus(money(h.onCostPct).div(100));
  const annualGrowth = money(1).plus(money(h.salaryGrowthPctAnnual).div(100));
  return horizon.map((pk) => {
    const idx = activeIndex(horizon, h.startPeriodKey, h.endPeriodKey, pk);
    if (idx < 0) return { periodKey: pk, value: ZERO };
    const years = new Decimal(idx).div(12);
    const growthFactor = annualGrowth.pow(years);
    return { periodKey: pk, value: monthlyBase.times(loading).times(growthFactor) };
  });
}

interface ProjectedItem {
  id: string;
  label: string;
  source:
    | "driver"
    | "headcount"
    | "loan"
    | "program_fee"
    | "platform_license"
    | "program_liability";
  accountCode: string;
  monthly: MonthlyValue[];
}

function groupByAccount(items: ProjectedItem[], horizon: string[]): PnLLine[] {
  const byAccount = new Map<
    string,
    { ids: string[]; items: PnLLineItem[]; monthly: Money[] }
  >();
  for (const it of items) {
    const bucket = byAccount.get(it.accountCode) ?? {
      ids: [],
      items: [],
      monthly: horizon.map(() => ZERO as Money),
    };
    bucket.ids.push(it.id);
    bucket.items.push({
      id: it.id,
      label: it.label,
      source: it.source,
      monthly: it.monthly,
      total: it.monthly.reduce((acc, m) => acc.plus(m.value), ZERO as Money),
    });
    for (let i = 0; i < horizon.length; i++) {
      bucket.monthly[i] = bucket.monthly[i].plus(it.monthly[i].value);
    }
    byAccount.set(it.accountCode, bucket);
  }
  return Array.from(byAccount.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountCode, bucket]) => ({
      accountCode,
      driverIds: bucket.ids,
      items: bucket.items,
      monthly: horizon.map((pk, i) => ({ periodKey: pk, value: bucket.monthly[i] })),
      total: bucket.monthly.reduce((acc, v) => acc.plus(v), ZERO as Money),
    }));
}

function sectionFromLines(lines: PnLLine[], horizon: string[]): PnLSection {
  const totals: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: lines.reduce((acc, l) => acc.plus(l.monthly[i].value), ZERO as Money),
  }));
  return {
    lines,
    totals,
    total: totals.reduce((acc, m) => acc.plus(m.value), ZERO as Money),
  };
}

export function computePnL(
  drivers: DriverInput[],
  headcount: HeadcountInput[],
  horizon: string[],
  loans: LoanInput[] = [],
  programFees: ProgramFeeInput[] = [],
  loanBookGrowthPctByYear: Decimal.Value[] = [],
  platformLicenses: PlatformLicenseInput[] = [],
  programLiabilities: ProgramLiabilityInput[] = [],
  baseRateBps: Decimal.Value = 0,
): PnL {
  const recurring = drivers.filter(
    (d): d is RecurringRevenueDriverInput => d.kind === "recurring_revenue",
  );
  const feeVol = drivers.filter(
    (d): d is FeeVolumeRevenueDriverInput => d.kind === "fee_x_volume",
  );
  const oneOff = drivers.filter((d): d is OneOffRevenueDriverInput => d.kind === "one_off");
  const opexFixed = drivers.filter((d): d is OpexFixedDriverInput => d.kind === "opex_fixed");
  const opexPct = drivers.filter(
    (d): d is OpexPctRevenueDriverInput => d.kind === "opex_pct_revenue",
  );
  const opexPerFte = drivers.filter(
    (d): d is OpexPerFteDriverInput => d.kind === "opex_per_fte",
  );
  const capex = drivers.filter(
    (d): d is CapexStraightLineDriverInput => d.kind === "capex_straight_line",
  );

  const driverItem = (
    d: { id: string; name: string; accountCode: string },
    monthly: MonthlyValue[],
  ): ProjectedItem => ({
    id: d.id,
    label: d.name,
    source: "driver",
    accountCode: d.accountCode,
    monthly,
  });

  const revenueProjected: ProjectedItem[] = [
    ...recurring.map((d) => driverItem(d, projectRecurringRevenue(d, horizon))),
    ...feeVol.map((d) => driverItem(d, projectFeeVolumeRevenue(d, horizon))),
    ...oneOff.map((d) => driverItem(d, projectOneOffRevenue(d, horizon))),
    ...loans.map(
      (l): ProjectedItem => ({
        id: l.id,
        label: l.loanId,
        source: "loan",
        accountCode: l.accountCode,
        monthly: projectLoanRevenue(l, horizon, baseRateBps, loanBookGrowthPctByYear),
      }),
    ),
    ...programFees.map(
      (f): ProjectedItem => ({
        id: f.id,
        label: `${f.programName} · ${f.feeName}`,
        source: "program_fee",
        accountCode: f.accountCode,
        monthly: projectProgramFee(f, horizon),
      }),
    ),
    ...platformLicenses.map(
      (l): ProjectedItem => ({
        id: l.id,
        label: l.name,
        source: "platform_license",
        accountCode: licenseAccount(l),
        monthly: projectPlatformLicense(l, horizon),
      }),
    ),
  ];
  const revenueLines = groupByAccount(revenueProjected, horizon);
  const revenue = sectionFromLines(revenueLines, horizon);

  const fteCount = activeFteCount(headcount, horizon);

  const fixedProjected: ProjectedItem[] = opexFixed.map((d) =>
    driverItem(d, projectOpexFixed(d, horizon)),
  );
  const pctProjected: ProjectedItem[] = opexPct.map((d) =>
    driverItem(d, projectOpexPctRevenue(d, horizon, revenue.totals)),
  );
  const perFteProjected: ProjectedItem[] = opexPerFte.map((d) =>
    driverItem(d, projectOpexPerFte(d, horizon, fteCount)),
  );
  const depreciationProjected: ProjectedItem[] = capex.map((d) =>
    driverItem({ ...d, name: `${d.name} (depreciation)` }, projectCapexDepreciation(d, horizon)),
  );
  const headcountProjected: ProjectedItem[] = headcount.map((h) => ({
    id: h.id,
    label: h.personName ? `${h.personName} · ${h.role}` : h.role,
    source: "headcount",
    accountCode: h.accountCode,
    monthly: projectHeadcount(h, horizon),
  }));
  const liabilityProjected: ProjectedItem[] = programLiabilities.map((l) => ({
    id: l.id,
    label: `${l.programName} · ${l.trancheName}`,
    source: "program_liability",
    accountCode: l.accountCode || DEFAULT_LIABILITY_ACCOUNT,
    monthly: projectProgramLiability(l, horizon, baseRateBps),
  }));
  const opexLines = groupByAccount(
    [
      ...fixedProjected,
      ...pctProjected,
      ...perFteProjected,
      ...depreciationProjected,
      ...headcountProjected,
    ],
    horizon,
  );
  const opex = sectionFromLines(opexLines, horizon);

  const liabilityLines = groupByAccount(liabilityProjected, horizon);
  const liabilities = sectionFromLines(liabilityLines, horizon);

  const grossProfit: MonthlyValue[] = horizon.map((pk, i) => ({
    periodKey: pk,
    value: revenue.totals[i].value.minus(opex.totals[i].value),
  }));
  const grossProfitTotal = grossProfit.reduce((acc, m) => acc.plus(m.value), ZERO as Money);

  return { horizon, revenue, opex, liabilities, grossProfit, grossProfitTotal };
}
