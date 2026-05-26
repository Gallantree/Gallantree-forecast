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
import { Scenario } from "@/models";
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

  const inputs = await loadEngineInputs(scenarioId);
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

  const val = computeValuation(
    fyGroups,
    {
      revenueTotals: statements.pnl.revenue.totals,
      ebitda: statements.pnl.ebitda,
      ebit: statements.pnl.ebit,
      netIncome: statements.pnl.netIncome,
      netCashMovement: statements.cf.netCashMovement,
      equity: statements.bs.equity,
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
    revenue: sumByFy(statements.pnl.revenue.totals),
    ebitda: sumByFy(statements.pnl.ebitda),
    ebit: sumByFy(statements.pnl.ebit),
    netIncome: sumByFy(statements.pnl.netIncome),
    fcf: sumByFy(statements.cf.netCashMovement),
    aum: ops.aumByYear,
    loans: ops.loanCountByYear,
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
  // Both scenarios must share the same horizon for the comparison to be
  // meaningful. If they diverge (e.g. different firstYearLabel), align on the
  // shorter and warn via the absence of trailing columns.
  const n = Math.min(base.fys.length, current.fys.length);
  const slice = (a: number[]) => a.slice(0, n);
  const fys = base.fys.slice(0, n);

  const groups: ComparisonGroup[] = [
    {
      title: "Profit & loss",
      rows: [
        flowRow("Revenue", "money", slice(base.revenue), slice(current.revenue)),
        flowRow("EBITDA", "money", slice(base.ebitda), slice(current.ebitda)),
        flowRow("EBIT", "money", slice(base.ebit), slice(current.ebit)),
        flowRow("Net income", "money", slice(base.netIncome), slice(current.netIncome)),
        flowRow("Free cash flow", "money", slice(base.fcf), slice(current.fcf)),
      ],
    },
    {
      title: "Operations",
      rows: [
        stockRow(
          "AUM (avg outstanding)",
          "moneyCompact",
          slice(base.aum),
          slice(current.aum),
          "peak",
        ),
        stockRow("Loans on book (avg)", "decimal", slice(base.loans), slice(current.loans), "peak"),
        stockRow("FTE (avg)", "decimal", slice(base.fte), slice(current.fte), "avg"),
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
