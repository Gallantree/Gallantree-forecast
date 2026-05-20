import { Types } from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { buildScenarioPeriods } from "@/constants/periods";
import { loadEngineInputs } from "@/engine/inputs";
import type { MonthlyValue, PnLSection } from "@/engine/pnl";
import { computeStatements, type ScenarioAssumptions } from "@/engine/statements";
import { connectToDatabase } from "@/lib/db";
import { Period, Scenario } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

type D128Like = { toString: () => string } | undefined;

function ser(series: MonthlyValue[]) {
  return series.map((m) => ({ periodKey: m.periodKey, value: m.value.toFixed(2) }));
}

function serializeSection(s: PnLSection) {
  return {
    lines: s.lines.map((l) => ({
      accountCode: l.accountCode,
      driverIds: l.driverIds,
      monthly: ser(l.monthly),
      total: l.total.toFixed(2),
    })),
    totals: ser(s.totals),
    total: s.total.toFixed(2),
  };
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
    }>(),
    loadEngineInputs(id),
  ]);
  if (!scenario) {
    return NextResponse.json({ error: "scenario not found" }, { status: 404 });
  }
  if (periods.length === 0) {
    return NextResponse.json({ error: "periods not seeded — run `npm run seed`" }, { status: 412 });
  }
  const horizon = buildScenarioPeriods(scenario.firstYearLabel ?? 2026, periods.length).map(
    (p) => p.key,
  );
  const assumptions: ScenarioAssumptions = {
    dsoDays: scenario.dsoDays?.toString(),
    dpoDays: scenario.dpoDays?.toString(),
    taxRatePct: scenario.taxRatePct?.toString(),
    openingCash: scenario.openingCash?.toString(),
    openingEquity: scenario.openingEquity?.toString(),
    loanBookGrowthPctByYear: (scenario.loanBookGrowthPctByYear ?? []).map((d) => d.toString()),
    baseRateBps: scenario.baseRateBps,
  };
  const s = computeStatements(
    inputs.drivers,
    inputs.headcount,
    horizon,
    assumptions,
    inputs.loans,
    inputs.programFees,
    inputs.platformLicenses,
    inputs.programLiabilities,
    inputs.capitalRaises,
  );
  return NextResponse.json({
    horizon: s.horizon,
    pnl: {
      revenue: serializeSection(s.pnl.revenue),
      opex: serializeSection(s.pnl.opex),
      depreciation: ser(s.pnl.depreciation),
      ebitda: ser(s.pnl.ebitda),
      ebit: ser(s.pnl.ebit),
      taxExpense: ser(s.pnl.taxExpense),
      netIncome: ser(s.pnl.netIncome),
      netIncomeTotal: s.pnl.netIncomeTotal.toFixed(2),
    },
    bs: {
      ar: ser(s.bs.ar),
      ap: ser(s.bs.ap),
      ppeGross: ser(s.bs.ppeGross),
      accumulatedDepreciation: ser(s.bs.accumulatedDepreciation),
      ppeNet: ser(s.bs.ppeNet),
      cash: ser(s.bs.cash),
      totalAssets: ser(s.bs.totalAssets),
      equity: ser(s.bs.equity),
      totalLiabilitiesAndEquity: ser(s.bs.totalLiabilitiesAndEquity),
    },
    cf: {
      netIncome: ser(s.cf.netIncome),
      depreciation: ser(s.cf.depreciation),
      changeInAr: ser(s.cf.changeInAr),
      changeInAp: ser(s.cf.changeInAp),
      capexOutflow: ser(s.cf.capexOutflow),
      netCashMovement: ser(s.cf.netCashMovement),
      endingCash: ser(s.cf.endingCash),
    },
  });
}
