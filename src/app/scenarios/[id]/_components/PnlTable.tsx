import Decimal from "decimal.js";
import type { MonthlyValue, PnL, PnLSection } from "@/engine/pnl";
import { ZERO } from "@/utils/money";
import {
  type FYGroup,
  type OpexItemEditTarget,
  type PnlCascadeSeries,
  PnlClientTable,
  type SerializedLine,
  type SerializedSection,
} from "./PnlClientTable";

export type { FYGroup };

export function buildFYGroups(periods: { key: string; fiscalYear: number }[]): FYGroup[] {
  const map = new Map<number, string[]>();
  for (const p of periods) {
    if (!map.has(p.fiscalYear)) map.set(p.fiscalYear, []);
    map.get(p.fiscalYear)!.push(p.key);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, months]) => ({ fy, months }));
}

function serializeMonthly(series: MonthlyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of series) out[m.periodKey] = m.value.toFixed(2);
  return out;
}

function serializeSection(s: PnLSection): SerializedSection {
  const lines: SerializedLine[] = s.lines.map((l) => ({
    accountCode: l.accountCode,
    monthly: serializeMonthly(l.monthly),
    items: l.items.map((i) => ({
      id: i.id,
      label: i.label,
      source: i.source,
      monthly: serializeMonthly(i.monthly),
    })),
  }));
  return { lines, totals: serializeMonthly(s.totals) };
}

// ── Gallantree filter ──────────────────────────────────────────────────────
//
// Mirrors `toGallantreeOverview()` in overviewData.ts: drops the NIM-revenue
// account-code band (4100-4499 — CRE CLO / CMBS / Warehouse / Non-Conforming
// NIM) and zeroes capital-program interest expense. Returns a new PnL with
// recomputed revenue totals + grossProfit, plus a derived cascade where
// EBITDA/EBIT/Pre-tax/Tax/Net income reflect the smaller revenue base and
// the absent interest deduction. Tax keeps the original implied per-month
// effective rate so the cascade stays internally consistent.

const NIM_REVENUE_PATTERN = /^4[1-4]\d\d$/;

interface CascadeMaps {
  ebitda: Map<string, Decimal>;
  depreciation: Map<string, Decimal>;
  ebit: Map<string, Decimal>;
  interestExpense: Map<string, Decimal>;
  pretaxIncome: Map<string, Decimal>;
  taxExpense: Map<string, Decimal>;
  netIncome: Map<string, Decimal>;
}

function seriesToMap(series: MonthlyValue[]): Map<string, Decimal> {
  const m = new Map<string, Decimal>();
  for (const v of series) m.set(v.periodKey, v.value);
  return m;
}

function mapToSeries(horizon: string[], m: Map<string, Decimal>): MonthlyValue[] {
  return horizon.map((k) => ({ periodKey: k, value: m.get(k) ?? ZERO }));
}

function sumMap(horizon: string[], m: Map<string, Decimal>): Decimal {
  let s = ZERO;
  for (const k of horizon) s = s.plus(m.get(k) ?? ZERO);
  return s;
}

export function toGallantreePnl(
  pnl: PnL,
  cascade: PnlCascadeSeries | undefined,
): { pnl: PnL; cascade: PnlCascadeSeries | undefined } {
  const keptLines = pnl.revenue.lines.filter((l) => !NIM_REVENUE_PATTERN.test(l.accountCode));
  const droppedLines = pnl.revenue.lines.filter((l) => NIM_REVENUE_PATTERN.test(l.accountCode));

  // Per-month delta that the cascade needs to be reduced by.
  const droppedByMonth = new Map<string, Decimal>();
  for (const k of pnl.horizon) droppedByMonth.set(k, ZERO);
  for (const l of droppedLines) {
    for (const m of l.monthly) {
      droppedByMonth.set(m.periodKey, (droppedByMonth.get(m.periodKey) ?? ZERO).plus(m.value));
    }
  }

  // Recompute revenue totals + total over the surviving lines.
  const newRevenueTotalsMap = new Map<string, Decimal>();
  for (const k of pnl.horizon) newRevenueTotalsMap.set(k, ZERO);
  for (const l of keptLines) {
    for (const m of l.monthly) {
      newRevenueTotalsMap.set(
        m.periodKey,
        (newRevenueTotalsMap.get(m.periodKey) ?? ZERO).plus(m.value),
      );
    }
  }
  const newRevenueTotals = mapToSeries(pnl.horizon, newRevenueTotalsMap);
  const newRevenueTotal = sumMap(pnl.horizon, newRevenueTotalsMap);
  const newRevenueSection: PnLSection = {
    lines: keptLines,
    totals: newRevenueTotals,
    total: newRevenueTotal,
  };

  // Recompute gross profit (revenue − opex).
  const opexTotalsMap = seriesToMap(pnl.opex.totals);
  const newGrossProfit = pnl.horizon.map((k) => ({
    periodKey: k,
    value: (newRevenueTotalsMap.get(k) ?? ZERO).minus(opexTotalsMap.get(k) ?? ZERO),
  }));
  const newGrossProfitTotal = newGrossProfit.reduce<Decimal>(
    (acc, m) => acc.plus(m.value),
    new Decimal(0),
  );

  const newPnl: PnL = {
    horizon: pnl.horizon,
    revenue: newRevenueSection,
    opex: pnl.opex,
    // No liability interest in the Gallantree view; drop these lines so the
    // P&L section that renders them (if any caller surfaces .liabilities)
    // shows nothing.
    liabilities: { lines: [], totals: mapToSeries(pnl.horizon, new Map()), total: ZERO },
    grossProfit: newGrossProfit,
    grossProfitTotal: newGrossProfitTotal,
  };

  // Cascade adjustments. Each per-month metric loses the NIM-revenue delta;
  // interest expense disappears entirely so pre-tax becomes EBIT. Tax
  // preserves the original implied effective rate so the cascade stays
  // internally consistent.
  let newCascade: PnlCascadeSeries | undefined;
  if (cascade) {
    const toDecMap = (rec: Record<string, string>): Map<string, Decimal> => {
      const m = new Map<string, Decimal>();
      for (const [k, v] of Object.entries(rec)) m.set(k, new Decimal(v));
      return m;
    };
    const toStringMap = (m: Map<string, Decimal>): Record<string, string> => {
      const out: Record<string, string> = {};
      for (const [k, v] of m) out[k] = v.toFixed(2);
      return out;
    };
    const orig: CascadeMaps = {
      ebitda: toDecMap(cascade.ebitda),
      depreciation: toDecMap(cascade.depreciation),
      ebit: toDecMap(cascade.ebit),
      interestExpense: toDecMap(cascade.interestExpense),
      pretaxIncome: toDecMap(cascade.pretaxIncome),
      taxExpense: toDecMap(cascade.taxExpense),
      netIncome: toDecMap(cascade.netIncome),
    };
    const newEbitda = new Map<string, Decimal>();
    const newEbit = new Map<string, Decimal>();
    const newPretax = new Map<string, Decimal>();
    const newTax = new Map<string, Decimal>();
    const newNetIncome = new Map<string, Decimal>();
    const zeros = new Map<string, Decimal>();
    for (const k of pnl.horizon) {
      const drop = droppedByMonth.get(k) ?? ZERO;
      const ebitda = (orig.ebitda.get(k) ?? ZERO).minus(drop);
      const ebit = (orig.ebit.get(k) ?? ZERO).minus(drop);
      // No interest deduction in the Gallantree cascade.
      const pretax = ebit;
      // Preserve the original implied effective tax rate per month so this
      // stays consistent with the standard view. Fall back to 0 when the
      // original pretax was zero.
      const origPretax = orig.pretaxIncome.get(k) ?? ZERO;
      const origTax = orig.taxExpense.get(k) ?? ZERO;
      const rate = origPretax.isZero() ? new Decimal(0) : origTax.div(origPretax);
      const tax = pretax.times(rate);
      const net = pretax.minus(tax);
      newEbitda.set(k, ebitda);
      newEbit.set(k, ebit);
      newPretax.set(k, pretax);
      newTax.set(k, tax);
      newNetIncome.set(k, net);
      zeros.set(k, ZERO);
    }
    newCascade = {
      ebitda: toStringMap(newEbitda),
      depreciation: cascade.depreciation,
      ebit: toStringMap(newEbit),
      interestExpense: toStringMap(zeros),
      pretaxIncome: toStringMap(newPretax),
      taxExpense: toStringMap(newTax),
      netIncome: toStringMap(newNetIncome),
    };
  }

  return { pnl: newPnl, cascade: newCascade };
}

export function PnlTable({
  pnl,
  groups,
  accountByCode,
  showSection = "both",
  opexItemEditTargets,
  expenseAccounts,
  defaultStartPeriod,
  cascade,
}: {
  pnl: PnL;
  groups: FYGroup[];
  accountByCode: Map<string, string>;
  showSection?: "both" | "revenue" | "opex";
  opexItemEditTargets?: Record<string, OpexItemEditTarget>;
  expenseAccounts?: { code: string; name: string }[];
  defaultStartPeriod?: string;
  cascade?: PnlCascadeSeries;
}) {
  const accountByCodeObj: Record<string, string> = {};
  for (const [k, v] of accountByCode) accountByCodeObj[k] = v;

  const revenue =
    showSection === "both" || showSection === "revenue" ? serializeSection(pnl.revenue) : undefined;
  const opex =
    showSection === "both" || showSection === "opex" ? serializeSection(pnl.opex) : undefined;
  const grossProfit = showSection === "both" ? serializeMonthly(pnl.grossProfit) : undefined;

  return (
    <PnlClientTable
      horizon={pnl.horizon}
      groups={groups}
      accountByCode={accountByCodeObj}
      revenue={revenue}
      opex={opex}
      grossProfit={grossProfit}
      showSection={showSection}
      opexItemEditTargets={opexItemEditTargets}
      expenseAccounts={expenseAccounts}
      defaultStartPeriod={defaultStartPeriod}
      cascade={cascade}
    />
  );
}
