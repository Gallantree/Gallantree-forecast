import Decimal from "decimal.js";
import ExcelJS from "exceljs";
import { Types } from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { buildScenarioPeriods } from "@/constants/periods";
import { loadEngineInputs } from "@/engine/inputs";
import type { MonthlyValue } from "@/engine/pnl";
import { computeStatements, type ScenarioAssumptions } from "@/engine/statements";
import { connectToDatabase } from "@/lib/db";
import { Period, Scenario } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
type D128Like = { toString: () => string } | undefined;

function decimalToNumber(d: Decimal): number {
  return Number(d.toFixed(2));
}

function row(label: string, series: MonthlyValue[], total?: Decimal): (string | number)[] {
  const cells: (string | number)[] = [label, ...series.map((m) => decimalToNumber(m.value))];
  if (total) cells.push(decimalToNumber(total));
  return cells;
}

function headerRow(label: string, horizon: string[], includeTotal: boolean): string[] {
  return [label, ...horizon, ...(includeTotal ? ["Total"] : [])];
}

function sumDecimal(series: MonthlyValue[]): Decimal {
  return series.reduce((acc, m) => acc.plus(m.value), new Decimal(0));
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
      name: string;
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
  if (!scenario) return NextResponse.json({ error: "scenario not found" }, { status: 404 });
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
    inputs.programUpfrontFees,
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Gallantree Forecast";
  wb.created = new Date();

  // Assumptions sheet
  const aSheet = wb.addWorksheet("Assumptions");
  aSheet.addRows([
    ["Scenario", scenario.name],
    ["DSO (days)", assumptions.dsoDays ?? ""],
    ["DPO (days)", assumptions.dpoDays ?? ""],
    ["Tax rate (%)", assumptions.taxRatePct ?? ""],
    ["Opening cash", assumptions.openingCash ?? ""],
    ["Opening equity", assumptions.openingEquity ?? ""],
    [],
    ["Drivers"],
    ["Name", "Type", "Account", "Start", "End"],
    ...inputs.drivers.map((d) => [
      d.name,
      d.kind,
      d.accountCode,
      d.startPeriodKey,
      d.endPeriodKey ?? "",
    ]),
    [],
    ["Headcount"],
    ["Role", "Account", "Start", "End", "Salary", "On-cost %", "Growth % p.a."],
    ...inputs.headcount.map((h) => [
      h.role,
      h.accountCode,
      h.startPeriodKey,
      h.endPeriodKey ?? "",
      h.salaryAnnual.toString(),
      h.onCostPct.toString(),
      h.salaryGrowthPctAnnual.toString(),
    ]),
  ]);
  aSheet.getRow(1).font = { bold: true };

  // P&L sheet
  const pSheet = wb.addWorksheet("P&L");
  pSheet.addRow(headerRow("Line", horizon, true)).font = { bold: true };
  pSheet.addRow(["Revenue"]);
  for (const line of s.pnl.revenue.lines) {
    pSheet.addRow(row(`  ${line.accountCode}`, line.monthly, line.total));
  }
  pSheet.addRow(row("Total revenue", s.pnl.revenue.totals, s.pnl.revenue.total)).font = {
    bold: true,
  };
  pSheet.addRow([]);
  pSheet.addRow(["Operating expenses"]);
  for (const line of s.pnl.opex.lines) {
    pSheet.addRow(row(`  ${line.accountCode}`, line.monthly, line.total));
  }
  pSheet.addRow(row("Total opex (incl. dep)", s.pnl.opex.totals, s.pnl.opex.total)).font = {
    bold: true,
  };
  pSheet.addRow([]);
  pSheet.addRow(row("EBITDA", s.pnl.ebitda, sumDecimal(s.pnl.ebitda)));
  pSheet.addRow(row("Depreciation", s.pnl.depreciation, sumDecimal(s.pnl.depreciation)));
  pSheet.addRow(row("EBIT", s.pnl.ebit, sumDecimal(s.pnl.ebit)));
  pSheet.addRow(row("Tax", s.pnl.taxExpense, sumDecimal(s.pnl.taxExpense)));
  pSheet.addRow(row("Net income", s.pnl.netIncome, s.pnl.netIncomeTotal)).font = { bold: true };

  // BS sheet
  const bSheet = wb.addWorksheet("Balance Sheet");
  bSheet.addRow(headerRow("Line", horizon, false)).font = { bold: true };
  bSheet.addRow(["Assets"]);
  bSheet.addRow(row("  Cash", s.bs.cash));
  bSheet.addRow(row("  Accounts receivable", s.bs.ar));
  bSheet.addRow(row("  PPE gross", s.bs.ppeGross));
  bSheet.addRow(row("  Accumulated depreciation", s.bs.accumulatedDepreciation));
  bSheet.addRow(row("  PPE net", s.bs.ppeNet));
  bSheet.addRow(row("  Prepaid issuance costs", s.bs.prepaidIssuanceCosts));
  bSheet.addRow(row("Total assets", s.bs.totalAssets)).font = { bold: true };
  bSheet.addRow([]);
  bSheet.addRow(["Liabilities & Equity"]);
  bSheet.addRow(row("  Accounts payable", s.bs.ap));
  bSheet.addRow(row("  Deferred revenue", s.bs.deferredRevenue));
  bSheet.addRow(row("  Equity", s.bs.equity));
  bSheet.addRow(row("Total L&E", s.bs.totalLiabilitiesAndEquity)).font = { bold: true };

  // CF sheet
  const cSheet = wb.addWorksheet("Cashflow");
  cSheet.addRow(headerRow("Line", horizon, false)).font = { bold: true };
  cSheet.addRow(row("Net income", s.cf.netIncome));
  cSheet.addRow(row("+ Depreciation", s.cf.depreciation));
  cSheet.addRow(row("+ Issuance cost amortisation", s.cf.issuanceAmortisation));
  cSheet.addRow(row("- Change in AR", s.cf.changeInAr));
  cSheet.addRow(row("+ Change in AP", s.cf.changeInAp));
  cSheet.addRow(row("+ Change in deferred revenue", s.cf.changeInDeferredRevenue));
  cSheet.addRow(row("- Issuance cost outflow", s.cf.issuanceCostOutflow));
  cSheet.addRow(row("- Capex outflow", s.cf.capexOutflow));
  cSheet.addRow(row("Net cash movement", s.cf.netCashMovement)).font = { bold: true };
  cSheet.addRow(row("Ending cash", s.cf.endingCash)).font = { bold: true };

  for (const ws of [pSheet, bSheet, cSheet]) {
    ws.getColumn(1).width = 32;
    for (let c = 2; c <= horizon.length + 2; c++) {
      ws.getColumn(c).width = 14;
      ws.getColumn(c).numFmt = "#,##0.00;(#,##0.00)";
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `${scenario.name.replace(/[^a-z0-9-]+/gi, "_")}_forecast.xlsx`;
  return new NextResponse(buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
