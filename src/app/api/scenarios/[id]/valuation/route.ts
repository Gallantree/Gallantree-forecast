import { Types } from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { buildScenarioPeriods } from "@/constants/periods";
import { loadEngineInputs } from "@/engine/inputs";
import { computeStatements } from "@/engine/statements";
import { computeValuation } from "@/engine/valuation";
import { connectToDatabase } from "@/lib/db";
import { Period, Scenario } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type D128Like = { toString: () => string } | undefined;

interface FYGroup {
  fy: number;
  months: string[];
}

function fiscalYear(year: number, month: number): number {
  return month >= 7 ? year + 1 : year;
}

function buildFYGroups(periods: { key: string; fiscalYear?: number }[]): FYGroup[] {
  const map = new Map<number, string[]>();
  for (const p of periods) {
    const [yStr, mStr] = p.key.split("-");
    const fy = p.fiscalYear ?? fiscalYear(Number(yStr), Number(mStr));
    if (!map.has(fy)) map.set(fy, []);
    map.get(fy)!.push(p.key);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, months]) => ({ fy, months }));
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  await connectToDatabase();
  const [periods, scenario, inputs] = await Promise.all([
    Period.find({}).sort({ index: 1 }).lean(),
    Scenario.findById(id).lean<{
      dsoDays?: D128Like;
      dpoDays?: D128Like;
      taxRatePct?: D128Like;
      openingCash?: D128Like;
      openingEquity?: D128Like;
      loanBookGrowthPctByYear?: Array<{ toString: () => string }>;
      baseRateBps?: number;
      firstYearLabel?: number;
      waccPct?: D128Like;
      terminalGrowthPct?: D128Like;
      evEbitdaMultiple?: D128Like;
      evRevenueMultiple?: D128Like;
      peMultiple?: D128Like;
      netDebt?: D128Like;
    }>(),
    loadEngineInputs(id),
  ]);
  if (!scenario) return NextResponse.json({ error: "scenario not found" }, { status: 404 });
  if (periods.length === 0) {
    return NextResponse.json({ error: "periods not seeded — run `npm run seed`" }, { status: 412 });
  }
  const scenarioPeriods = buildScenarioPeriods(scenario.firstYearLabel ?? 2026, periods.length);
  const horizon = scenarioPeriods.map((p) => p.key);
  const groups = buildFYGroups(scenarioPeriods);

  const s = computeStatements(
    inputs.drivers,
    inputs.headcount,
    horizon,
    {
      dsoDays: scenario.dsoDays?.toString(),
      dpoDays: scenario.dpoDays?.toString(),
      taxRatePct: scenario.taxRatePct?.toString(),
      openingCash: scenario.openingCash?.toString(),
      openingEquity: scenario.openingEquity?.toString(),
      loanBookGrowthPctByYear: (scenario.loanBookGrowthPctByYear ?? []).map((d) => d.toString()),
      baseRateBps: scenario.baseRateBps,
    },
    inputs.loans,
    inputs.programFees,
    inputs.platformLicenses,
    inputs.programLiabilities,
    inputs.capitalRaises,
    inputs.programUpfrontFees,
  );

  const v = computeValuation(
    groups,
    {
      revenueTotals: s.pnl.revenue.totals,
      ebitda: s.pnl.ebitda,
      ebit: s.pnl.ebit,
      netIncome: s.pnl.netIncome,
      netCashMovement: s.cf.netCashMovement,
    },
    {
      waccPct: scenario.waccPct?.toString(),
      terminalGrowthPct: scenario.terminalGrowthPct?.toString(),
      evEbitdaMultiple: scenario.evEbitdaMultiple?.toString(),
      evRevenueMultiple: scenario.evRevenueMultiple?.toString(),
      peMultiple: scenario.peMultiple?.toString(),
      netDebt: scenario.netDebt?.toString(),
    },
  );

  // Serialise Decimal128/Money to strings before returning.
  return NextResponse.json({
    fys: v.fys,
    aggregates: v.aggregates.map((a) => ({
      fy: a.fy,
      revenue: a.revenue.toFixed(2),
      ebitda: a.ebitda.toFixed(2),
      ebit: a.ebit.toFixed(2),
      netIncome: a.netIncome.toFixed(2),
      fcf: a.fcf.toFixed(2),
    })),
    dcf: v.dcf.map((d) => ({
      horizonYears: d.horizonYears,
      presentValueFcfs: d.presentValueFcfs.toFixed(2),
      terminalValue: d.terminalValue.toFixed(2),
      presentValueTerminal: d.presentValueTerminal.toFixed(2),
      enterpriseValue: d.enterpriseValue.toFixed(2),
      equityValue: d.equityValue.toFixed(2),
      impliedExitMultipleOnEbitda: d.impliedExitMultipleOnEbitda.toFixed(2),
      invalidReason: d.invalidReason,
    })),
    evEbitda: v.evEbitda.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    evRevenue: v.evRevenue.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    pe: v.pe.map((m) => ({
      fy: m.fy,
      metric: m.metric.toFixed(2),
      multiple: m.multiple.toFixed(2),
      enterpriseValue: m.enterpriseValue.toFixed(2),
      equityValue: m.equityValue.toFixed(2),
    })),
    assumptions: {
      waccPct: v.assumptions.waccPct.toFixed(2),
      terminalGrowthPct: v.assumptions.terminalGrowthPct.toFixed(2),
      evEbitdaMultiple: v.assumptions.evEbitdaMultiple.toFixed(2),
      evRevenueMultiple: v.assumptions.evRevenueMultiple.toFixed(2),
      peMultiple: v.assumptions.peMultiple.toFixed(2),
      netDebt: v.assumptions.netDebt.toFixed(2),
    },
  });
}
