// Server-safe snapshot + comparison builder for the Scenario Analysis modal.
//
// The modal compares the current scenario against its base across the
// forecast horizon. Both scenarios run through the same engine + valuation
// stack so the only differences come from the inputs (drivers, headcount,
// loan book, capital programs, etc.) not from how the numbers are computed.
//
// `computeScenarioSnapshot` is async and hits the database — call it from a
// server component / server action. `buildScenarioComparison` is pure.

import { Types } from "mongoose";
import { buildScenarioPeriods, FORECAST_HORIZON_MONTHS } from "@/constants/periods";
import { loadEngineInputs } from "@/engine/inputs";
import type { MonthlyValue } from "@/engine/pnl";
import { computeStatements } from "@/engine/statements";
import { computeValuation } from "@/engine/valuation";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram, Scenario } from "@/models";
import { buildGallantreeMonthlyView } from "./gallantreeStatements";
import { buildOperationalKPIs } from "./overviewData";
import { buildFYGroups } from "./PnlTable";

export interface ScenarioSnapshot {
  id: string;
  name: string;
  status: string;
  fys: number[];
  // P&L cascade (per CY, in column order)
  revenue: number[];
  ebitda: number[];
  ebit: number[];
  netIncome: number[];
  fcf: number[];
  // Operations
  aum: number[];
  loans: number[];
  capitalPrograms: number[];
  fte: number[];
  // Valuation: equity value at the explicit-horizon DCF and at last-year
  // multiples — collapses each method to a single number for the comparison.
  dcfEquity5y: number;
  evEbitdaEquityLast: number;
  evAumEquityLast: number;
}

export async function computeScenarioSnapshot(
  scenarioId: string,
): Promise<ScenarioSnapshot | null> {
  if (!Types.ObjectId.isValid(scenarioId)) return null;
  await connectToDatabase();
  const scenario = await Scenario.findById(scenarioId).lean<{
    _id: { toString: () => string };
    name: string;
    status: string;
    viewMode?: "all" | "gallantree";
    firstYearLabel?: number;
    dsoDays?: { toString: () => string };
    dpoDays?: { toString: () => string };
    taxRatePct?: { toString: () => string };
    openingCash?: { toString: () => string };
    openingEquity?: { toString: () => string };
    baseRateBps?: number;
    loanBookGrowthPctByYear?: Array<{ toString: () => string }>;
    waccPct?: { toString: () => string };
    terminalGrowthPct?: { toString: () => string };
    evEbitdaMultiple?: { toString: () => string };
    evRevenueMultiple?: { toString: () => string };
    peMultiple?: { toString: () => string };
    netDebt?: { toString: () => string };
    pbMultiple?: { toString: () => string };
    aumOfMultiplePct?: { toString: () => string };
  }>();
  if (!scenario) return null;

  const [inputs, programDocs] = await Promise.all([
    loadEngineInputs(scenarioId),
    CapitalProgram.find({ scenarioId })
      .select({ startPeriodKey: 1, endPeriodKey: 1 })
      .lean<Array<{ startPeriodKey: string; endPeriodKey?: string }>>(),
  ]);
  const firstYear = scenario.firstYearLabel ?? 2026;
  const scenarioPeriods = buildScenarioPeriods(firstYear, FORECAST_HORIZON_MONTHS);
  const horizon = scenarioPeriods.map((p) => p.key);
  if (horizon.length === 0) return null;
  const fyGroups = buildFYGroups(scenarioPeriods);
  const baseRateBps = scenario.baseRateBps ?? 0;
  const loanBookGrowthPctByYear = (scenario.loanBookGrowthPctByYear ?? []).map((d) => d.toString());

  const statements = computeStatements(
    inputs.drivers,
    inputs.headcount,
    horizon,
    {
      dsoDays: scenario.dsoDays?.toString(),
      dpoDays: scenario.dpoDays?.toString(),
      taxRatePct: scenario.taxRatePct?.toString(),
      openingCash: scenario.openingCash?.toString(),
      openingEquity: scenario.openingEquity?.toString(),
      loanBookGrowthPctByYear,
      baseRateBps,
    },
    inputs.loans,
    inputs.programFees,
    inputs.platformLicenses,
    inputs.programLiabilities,
    inputs.capitalRaises,
    inputs.programUpfrontFees,
  );

  const ops = buildOperationalKPIs(
    fyGroups,
    inputs.loans.map((l) => ({
      originationPeriodKey: l.originationPeriodKey,
      maturityPeriodKey: l.maturityPeriodKey,
      balance: l.balance.toString(),
    })),
    inputs.headcount.map((h) => ({
      startPeriodKey: h.startPeriodKey,
      endPeriodKey: h.endPeriodKey,
      ftePct: h.ftePct?.toString(),
    })),
  );

  // When the scenario is in Gallantree view, strip NIM revenue + program-
  // tranche interest from the cascade so the snapshot mirrors what the user
  // sees on the Gallantree-filtered tabs. Otherwise use the raw engine output.
  const view =
    scenario.viewMode === "gallantree"
      ? buildGallantreeMonthlyView(statements, {
          openingCash: scenario.openingCash?.toString(),
          openingEquity: scenario.openingEquity?.toString(),
          taxRatePct: scenario.taxRatePct?.toString(),
        })
      : {
          revenueTotals: statements.pnl.revenue.totals,
          ebitda: statements.pnl.ebitda,
          ebit: statements.pnl.ebit,
          netIncome: statements.pnl.netIncome,
          netCashMovement: statements.cf.netCashMovement,
          equity: statements.bs.equity,
        };

  const val = computeValuation(
    fyGroups,
    {
      revenueTotals: view.revenueTotals,
      ebitda: view.ebitda,
      ebit: view.ebit,
      netIncome: view.netIncome,
      netCashMovement: view.netCashMovement,
      equity: view.equity,
      aumByYear: ops.aumByYear,
    },
    {
      waccPct: scenario.waccPct?.toString(),
      terminalGrowthPct: scenario.terminalGrowthPct?.toString(),
      evEbitdaMultiple: scenario.evEbitdaMultiple?.toString(),
      evRevenueMultiple: scenario.evRevenueMultiple?.toString(),
      peMultiple: scenario.peMultiple?.toString(),
      netDebt: scenario.netDebt?.toString(),
      pbMultiple: scenario.pbMultiple?.toString(),
      aumOfMultiplePct: scenario.aumOfMultiplePct?.toString(),
    },
  );

  const sumByFy = (series: MonthlyValue[]): number[] =>
    fyGroups.map((g) => {
      const set = new Set(g.months);
      let s = 0;
      for (const m of series) if (set.has(m.periodKey)) s += Number(m.value.toFixed(2));
      return s;
    });

  const lastDcf = val.dcf[val.dcf.length - 1];
  const lastEvEbitda = val.evEbitda[val.evEbitda.length - 1];
  const lastEvAum = val.evAum[val.evAum.length - 1];

  return {
    id: scenarioId,
    name: scenario.name,
    status: scenario.status,
    fys: fyGroups.map((g) => g.fy),
    revenue: sumByFy(view.revenueTotals),
    ebitda: sumByFy(view.ebitda),
    ebit: sumByFy(view.ebit),
    netIncome: sumByFy(view.netIncome),
    fcf: sumByFy(view.netCashMovement),
    aum: ops.aumByYear,
    loans: ops.loanCountByYear,
    // A program is "active" in a CY if any of its months overlap the CY.
    // Open-ended programs (no endPeriodKey) are treated as active forever
    // once they've started.
    capitalPrograms: fyGroups.map((g) => {
      let count = 0;
      for (const p of programDocs) {
        const end = p.endPeriodKey ?? "9999-12";
        const overlaps = g.months.some((m) => p.startPeriodKey <= m && m <= end);
        if (overlaps) count += 1;
      }
      return count;
    }),
    fte: ops.fteByYear,
    dcfEquity5y: lastDcf ? Number(lastDcf.equityValue.toFixed(2)) : 0,
    evEbitdaEquityLast: lastEvEbitda ? Number(lastEvEbitda.equityValue.toFixed(2)) : 0,
    evAumEquityLast: lastEvAum ? Number(lastEvAum.equityValue.toFixed(2)) : 0,
  };
}

// ── Comparison shape (client-safe; no engine deps) ─────────────────────────

export type MetricFormat = "money" | "moneyCompact" | "integer" | "decimal";

export interface ComparisonRow {
  label: string;
  format: MetricFormat;
  base: number[];
  current: number[];
  baseTotal: number; // sum for flow metrics, peak/avg for stock metrics
  currentTotal: number;
  totalLabel?: string; // e.g. "5y", "peak", "avg"
  // For valuation scalars there are no per-CY values — render a single column.
  scalarOnly?: boolean;
}

export interface ComparisonGroup {
  title: string;
  rows: ComparisonRow[];
}

export interface ScenarioComparisonData {
  fys: number[];
  base: { id: string; name: string; status: string };
  current: { id: string; name: string; status: string };
  groups: ComparisonGroup[];
}

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const peak = (a: number[]) => (a.length === 0 ? 0 : Math.max(...a));
const avg = (a: number[]) => (a.length === 0 ? 0 : sum(a) / a.length);

export function buildScenarioComparison(
  base: ScenarioSnapshot,
  current: ScenarioSnapshot,
): ScenarioComparisonData {
  // Align by shared fiscal year, not by array index. If the two scenarios
  // start at different firstYearLabel values, index 0 on each side maps to
  // different CYs — comparing them position-by-position would produce
  // misleading deltas. Take the intersection of fys and project both
  // snapshots through a (fy → original index) lookup.
  const baseIdx = new Map(base.fys.map((fy, i) => [fy, i]));
  const currentIdx = new Map(current.fys.map((fy, i) => [fy, i]));
  const fys = current.fys.filter((fy) => baseIdx.has(fy));
  const pickBase = (a: number[]) => fys.map((fy) => a[baseIdx.get(fy) as number] ?? 0);
  const pickCurrent = (a: number[]) => fys.map((fy) => a[currentIdx.get(fy) as number] ?? 0);

  const groups: ComparisonGroup[] = [
    {
      title: "Profit & loss",
      rows: [
        flowRow("Revenue", "money", pickBase(base.revenue), pickCurrent(current.revenue)),
        flowRow("EBITDA", "money", pickBase(base.ebitda), pickCurrent(current.ebitda)),
        flowRow("EBIT", "money", pickBase(base.ebit), pickCurrent(current.ebit)),
        flowRow("Net income", "money", pickBase(base.netIncome), pickCurrent(current.netIncome)),
        flowRow("Free cash flow", "money", pickBase(base.fcf), pickCurrent(current.fcf)),
      ],
    },
    {
      title: "Operations",
      rows: [
        stockRow(
          "AUM (avg outstanding)",
          "moneyCompact",
          pickBase(base.aum),
          pickCurrent(current.aum),
          "peak",
        ),
        stockRow(
          "Loans on book (avg)",
          "decimal",
          pickBase(base.loans),
          pickCurrent(current.loans),
          "peak",
        ),
        stockRow(
          "Capital programs (active)",
          "integer",
          pickBase(base.capitalPrograms),
          pickCurrent(current.capitalPrograms),
          "peak",
        ),
        stockRow("FTE (avg)", "decimal", pickBase(base.fte), pickCurrent(current.fte), "avg"),
      ],
    },
    {
      title: "Valuation (terminal year)",
      rows: [
        scalarRow("DCF equity value (5y horizon)", "money", base.dcfEquity5y, current.dcfEquity5y),
        scalarRow(
          "EV / EBITDA equity value",
          "money",
          base.evEbitdaEquityLast,
          current.evEbitdaEquityLast,
        ),
        scalarRow("% of AUM equity value", "money", base.evAumEquityLast, current.evAumEquityLast),
      ],
    },
  ];

  return {
    fys,
    base: { id: base.id, name: base.name, status: base.status },
    current: { id: current.id, name: current.name, status: current.status },
    groups,
  };
}

function flowRow(
  label: string,
  format: MetricFormat,
  base: number[],
  current: number[],
): ComparisonRow {
  return {
    label,
    format,
    base,
    current,
    baseTotal: sum(base),
    currentTotal: sum(current),
    totalLabel: "5y",
  };
}

function stockRow(
  label: string,
  format: MetricFormat,
  base: number[],
  current: number[],
  totalKind: "peak" | "avg",
): ComparisonRow {
  const reducer = totalKind === "peak" ? peak : avg;
  return {
    label,
    format,
    base,
    current,
    baseTotal: reducer(base),
    currentTotal: reducer(current),
    totalLabel: totalKind,
  };
}

function scalarRow(
  label: string,
  format: MetricFormat,
  base: number,
  current: number,
): ComparisonRow {
  return {
    label,
    format,
    base: [],
    current: [],
    baseTotal: base,
    currentTotal: current,
    scalarOnly: true,
  };
}
