import Link from "next/link";
import { Types } from "mongoose";
import { notFound } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import {
  Scenario,
  Driver,
  Headcount,
  Period,
  Account,
  Payband,
  Loan,
  CapitalProgram,
  PlatformLicense,
} from "@/models";
import { fmtMoney2 } from "@/utils/format";
import { computePnL, type MonthlyValue } from "@/engine/pnl";
import { computeStatements } from "@/engine/statements";
import { loadEngineInputs } from "@/engine/inputs";
import {
  buildScenarioPeriods,
  FORECAST_HORIZON_MONTHS,
} from "@/constants/periods";
import { PnlTable, buildFYGroups } from "./_components/PnlTable";
import { TabBar, isTabKey, type TabKey } from "./_components/TabBar";
import { StaffingTab, type StaffRow, type PaybandRow } from "./_components/StaffingTab";
import {
  LoansTab,
  type BookGrowthProfileRow,
  type LoanRow,
  type ProgramOption,
  type ProgramTypeKey,
} from "./_components/LoansTab";
import {
  isFundingTranche,
  ProgramsTab,
  type ProgramRow,
  type ProgramAggregate,
} from "./_components/ProgramsTab";
import {
  BalanceSheetTab,
  type BalanceSheetData,
  type SerializedSeries,
} from "./_components/BalanceSheetTab";
import { CashflowTab, type CashflowData } from "./_components/CashflowTab";
import {
  OverviewTab,
  type OverviewData,
} from "./_components/OverviewTab";
import { buildOverviewData } from "./_components/overviewData";
import { ValuationTab, type ValuationData } from "./_components/ValuationTab";
import {
  PlatformRevenuesTab,
  type PlatformLicenseRow,
} from "./_components/PlatformRevenuesTab";
import {
  OpexGeneralTab,
  type OpexDriverRow,
} from "./_components/OpexGeneralTab";
import { ControlPanelTab } from "./_components/ControlPanelTab";
import { computeValuation } from "@/engine/valuation";
import { addDriver } from "./_actions";

function serializeSeries(series: MonthlyValue[]): SerializedSeries {
  const monthly: Record<string, string> = {};
  for (const m of series) monthly[m.periodKey] = m.value.toFixed(2);
  return { monthly };
}

function monthlyMap(series: MonthlyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of series) out[m.periodKey] = m.value.toFixed(2);
  return out;
}

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function Stub({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 bg-white p-8 text-center">
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      <p className="max-w-md text-xs text-zinc-500">{message}</p>
    </div>
  );
}

export default async function ScenarioPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  if (!Types.ObjectId.isValid(id)) notFound();

  const tab: TabKey = isTabKey(rawTab) ? rawTab : "overview";

  await connectToDatabase();
  const scenario = await Scenario.findById(id).lean<{
    name: string;
    status: string;
    defaultCpiPct?: { toString: () => string };
    defaultSuperPct?: { toString: () => string };
    loanBookGrowthPctByYear?: Array<{ toString: () => string }>;
    bookGrowthProfiles?: Array<{
      _id: { toString: () => string };
      capitalProgramId: { toString: () => string };
      fyGrowthPcts?: Array<{ toString: () => string }>;
      avgTenorMonths: number;
      avgSpreadBps: number;
      riskLevel: "low" | "medium" | "high";
    }>;
    dsoDays?: { toString: () => string };
    dpoDays?: { toString: () => string };
    taxRatePct?: { toString: () => string };
    openingCash?: { toString: () => string };
    openingEquity?: { toString: () => string };
    baseRateType?: "BBSW" | "BBSY" | "SOFR";
    baseRateBps?: number;
    firstYearLabel?: number;
    waccPct?: { toString: () => string };
    terminalGrowthPct?: { toString: () => string };
    evEbitdaMultiple?: { toString: () => string };
    evRevenueMultiple?: { toString: () => string };
    peMultiple?: { toString: () => string };
    netDebt?: { toString: () => string };
  }>();
  if (!scenario) notFound();

  const [
    periods,
    accounts,
    drivers,
    headcountDocs,
    paybands,
    loanDocs,
    programDocs,
    licenseDocs,
    inputs,
  ] = await Promise.all([
    // Period docs are kept for historical reasons but the horizon is now
    // computed from scenario.firstYearLabel so changing the control-panel
    // year shifts every column across the platform. Treat the count as the
    // source of truth for "how many months to forecast".
    Period.find({}).sort({ index: 1 }).lean(),
    Account.find({}).sort({ code: 1 }).lean(),
    Driver.find({ scenarioId: id }).sort({ createdAt: 1 }).lean(),
    Headcount.find({ scenarioId: id }).sort({ createdAt: 1 }).lean<StaffRow[]>(),
    Payband.find({}).sort({ band: 1, tier: 1 }).lean<PaybandRow[]>(),
    Loan.find({ scenarioId: id }).sort({ loanId: 1 }).lean(),
    CapitalProgram.find({ scenarioId: id })
      .sort({ startPeriodKey: 1, name: 1 })
      .lean(),
    PlatformLicense.find({ scenarioId: id })
      .sort({ type: 1, startPeriodKey: 1, name: 1 })
      .lean(),
    loadEngineInputs(id),
  ]);

  // Map programId → type once, used to derive each loan's programType for
  // grouping (and to resolve revenue accounts in the engine).
  const programTypeById = new Map<string, ProgramTypeKey>();
  for (const p of programDocs as unknown as Array<{
    _id: { toString: () => string };
    type: string;
  }>) {
    const t = p.type as ProgramTypeKey;
    programTypeById.set(p._id.toString(), t);
  }

  // Pre-serialize loan _ids so the toggle button can bind them into a server
  // action without React 19 choking on ObjectId.toJSON returning {buffer:...}.
  type LeanLoan = {
    _id: { toString: () => string };
    loanId: string;
    borrower?: string;
    lenderOfRecord?: string;
    state?: string;
    assetClass?: string;
    propertyStatus?: string;
    location?: string;
    capitalProgramId?: { toString: () => string };
    originationDate: Date | string;
    maturityDate: Date | string;
    termMonths: number;
    balance: { toString: () => string };
    lvr?: { toString: () => string };
    dscr?: { toString: () => string };
    internalScore?: number;
    internalGrade?: string;
    creditSpreadBps?: number;
    allInPct?: { toString: () => string };
    includeInRevenue?: boolean;
  };
  const loanRows: LoanRow[] = (loanDocs as unknown as LeanLoan[]).map((l) => {
    const pid = l.capitalProgramId ? l.capitalProgramId.toString() : undefined;
    return {
      _id: l._id.toString(),
      loanId: l.loanId,
      borrower: l.borrower,
      lenderOfRecord: l.lenderOfRecord,
      state: l.state,
      assetClass: l.assetClass,
      propertyStatus: l.propertyStatus,
      location: l.location,
      capitalProgramId: pid,
      programType: pid ? programTypeById.get(pid) : undefined,
      originationDate: l.originationDate,
      maturityDate: l.maturityDate,
      termMonths: l.termMonths,
      balance: { toString: () => l.balance.toString() },
      lvr: l.lvr ? { toString: () => l.lvr!.toString() } : undefined,
      dscr: l.dscr ? { toString: () => l.dscr!.toString() } : undefined,
      internalScore: l.internalScore,
      internalGrade: l.internalGrade,
      creditSpreadBps: l.creditSpreadBps,
      allInPct: l.allInPct ? { toString: () => l.allInPct!.toString() } : undefined,
      includeInRevenue: l.includeInRevenue,
    };
  });

  // Platform licences — serialize Decimal128/array fields to plain shapes.
  type LeanLicense = {
    _id: { toString: () => string };
    name: string;
    type: "compliance" | "trustee";
    startPeriodKey: string;
    endPeriodKey?: string;
    notes?: string;
    tier?: PlatformLicenseRow["tier"];
    monthlyFeePerSeat?: { toString: () => string };
    seatCount?: number;
    seatGrowthPctAnnual?: { toString: () => string };
    billingFrequency?: "monthly" | "annual";
    annualDiscountPct?: { toString: () => string };
    monthlyFee?: { toString: () => string };
    configFee?: { toString: () => string };
    aumByYear?: Array<{ toString: () => string }>;
    feePctOfAumByYear?: Array<{ toString: () => string }>;
  };
  const licenseRows: PlatformLicenseRow[] = (licenseDocs as unknown as LeanLicense[]).map(
    (l) => ({
      _id: l._id.toString(),
      name: l.name,
      type: l.type,
      startPeriodKey: l.startPeriodKey,
      endPeriodKey: l.endPeriodKey,
      notes: l.notes,
      tier: l.tier,
      monthlyFeePerSeat: l.monthlyFeePerSeat
        ? { toString: () => l.monthlyFeePerSeat!.toString() }
        : undefined,
      seatCount: l.seatCount,
      seatGrowthPctAnnual: l.seatGrowthPctAnnual
        ? { toString: () => l.seatGrowthPctAnnual!.toString() }
        : undefined,
      billingFrequency: l.billingFrequency,
      annualDiscountPct: l.annualDiscountPct
        ? { toString: () => l.annualDiscountPct!.toString() }
        : undefined,
      monthlyFee: l.monthlyFee
        ? { toString: () => l.monthlyFee!.toString() }
        : undefined,
      configFee: l.configFee ? { toString: () => l.configFee!.toString() } : undefined,
      aumByYear: l.aumByYear
        ? l.aumByYear.map((v) => ({ toString: () => v.toString() }))
        : undefined,
      feePctOfAumByYear: l.feePctOfAumByYear
        ? l.feePctOfAumByYear.map((v) => ({ toString: () => v.toString() }))
        : undefined,
    }),
  );

  // Serialise OPEX drivers (excluding revenue + capex types) for the OPEX-General tab.
  type LeanDriver = {
    _id: { toString: () => string };
    name: string;
    type: string;
    accountCode: string;
    startPeriodKey: string;
    endPeriodKey?: string;
    baseMonthly?: { toString: () => string };
    monthlyGrowthPct?: { toString: () => string };
    pctOfRevenue?: { toString: () => string };
    costPerFteMonthly?: { toString: () => string };
  };
  const opexDriverRows: OpexDriverRow[] = (drivers as unknown as LeanDriver[])
    .filter(
      (d) =>
        d.type === "opex_fixed" ||
        d.type === "opex_pct_revenue" ||
        d.type === "opex_per_fte",
    )
    .map((d) => ({
      _id: d._id.toString(),
      type: d.type as OpexDriverRow["type"],
      name: d.name,
      accountCode: d.accountCode,
      startPeriodKey: d.startPeriodKey,
      endPeriodKey: d.endPeriodKey,
      baseMonthly: d.baseMonthly
        ? { toString: () => d.baseMonthly!.toString() }
        : undefined,
      monthlyGrowthPct: d.monthlyGrowthPct
        ? { toString: () => d.monthlyGrowthPct!.toString() }
        : undefined,
      pctOfRevenue: d.pctOfRevenue
        ? { toString: () => d.pctOfRevenue!.toString() }
        : undefined,
      costPerFteMonthly: d.costPerFteMonthly
        ? { toString: () => d.costPerFteMonthly!.toString() }
        : undefined,
    }));

  // Compact options list for the loan-book program selector (no fee detail).
  const programOptions: ProgramOption[] = (
    programDocs as unknown as Array<{
      _id: { toString: () => string };
      name: string;
      type: string;
    }>
  ).map((p) => ({ _id: p._id.toString(), name: p.name, type: p.type }));

  // Per-program weighted-avg DEBT funding spread (bps). Weight by tranche
  // principal (numNotes × face). See isFundingTranche() for what counts:
  // principal-paying debt only — equity, control/IO classes, zero-spread out.
  const programFundingBpsById: Record<string, number> = {};
  for (const p of programDocs as unknown as Array<{
    _id: { toString: () => string };
    faceValuePerNote?: { toString: () => string };
    liabilities?: Array<{ name?: string; numNotes?: number; returnProfileBps: number }>;
  }>) {
    const face = p.faceValuePerNote ? Number(p.faceValuePerNote.toString()) : 0;
    let weightedSum = 0;
    let totalPrincipal = 0;
    for (const l of p.liabilities ?? []) {
      if (!isFundingTranche(l.name, l.returnProfileBps)) continue;
      const principal = (l.numNotes ?? 0) * face;
      if (principal <= 0) continue;
      weightedSum += principal * l.returnProfileBps;
      totalPrincipal += principal;
    }
    programFundingBpsById[p._id.toString()] =
      totalPrincipal > 0 ? Math.round(weightedSum / totalPrincipal) : 0;
  }

  // Aggregates: count, balance, weighted averages — keyed by capitalProgramId.
  const programAggregates: Record<string, ProgramAggregate> = {};
  for (const l of loanRows) {
    const pid = l.capitalProgramId;
    if (!pid) continue;
    const bucket = (programAggregates[pid] ??= {
      loanCount: 0,
      totalBalance: 0,
      weightSumScore: 0,
      weightSumLvr: 0,
      weightSumDscr: 0,
      weightSumSpreadBps: 0,
      weightBalanceForScore: 0,
      weightBalanceForLvr: 0,
      weightBalanceForDscr: 0,
      weightBalanceForSpread: 0,
      fundingWasBps: programFundingBpsById[pid] ?? 0,
    });
    const bal = Number(l.balance.toString());
    bucket.loanCount += 1;
    bucket.totalBalance += bal;
    if (l.internalScore !== undefined) {
      bucket.weightSumScore += bal * l.internalScore;
      bucket.weightBalanceForScore += bal;
    }
    if (l.lvr) {
      bucket.weightSumLvr += bal * Number(l.lvr.toString());
      bucket.weightBalanceForLvr += bal;
    }
    if (l.dscr) {
      bucket.weightSumDscr += bal * Number(l.dscr.toString());
      bucket.weightBalanceForDscr += bal;
    }
    if (l.creditSpreadBps !== undefined) {
      bucket.weightSumSpreadBps += bal * l.creditSpreadBps;
      bucket.weightBalanceForSpread += bal;
    }
  }

  // Pre-serialize programs (and their embedded fee _ids) into plain shapes
  // so any bound server-action args downstream stay plain — React 19 / Next 16
  // refuses to serialize ObjectId/Decimal128 across the action boundary.
  const programRows: ProgramRow[] = (programDocs as unknown as Array<{
    _id: { toString: () => string };
    name: string;
    type: ProgramRow["type"];
    dealSize?: { toString: () => string };
    faceValuePerNote?: { toString: () => string };
    startPeriodKey: string;
    endPeriodKey?: string;
    notes?: string;
    fees: Array<{
      _id: { toString: () => string };
      name: string;
      category: ProgramRow["fees"][number]["category"];
      basisAmount: { toString: () => string };
      feeBps: number;
      accountCode: string;
    }>;
    liabilities?: Array<{
      _id: { toString: () => string };
      name: string;
      numNotes?: number;
      returnProfileBps: number;
      calculationMethod: "monthly" | "quarterly" | "annually";
      rateType: "fixed" | "variable";
      accountCode?: string;
    }>;
  }>).map((p) => ({
    _id: p._id.toString(),
    name: p.name,
    type: p.type,
    dealSize: p.dealSize ? { toString: () => p.dealSize!.toString() } : undefined,
    faceValuePerNote: p.faceValuePerNote
      ? { toString: () => p.faceValuePerNote!.toString() }
      : undefined,
    startPeriodKey: p.startPeriodKey,
    endPeriodKey: p.endPeriodKey,
    notes: p.notes,
    fees: p.fees.map((f) => ({
      _id: f._id.toString(),
      name: f.name,
      category: f.category,
      basisAmount: { toString: () => f.basisAmount.toString() },
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
    liabilities: (p.liabilities ?? []).map((l) => ({
      _id: l._id.toString(),
      name: l.name,
      numNotes: l.numNotes,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode,
    })),
  }));

  // Year 1 calendar year from the Control Panel — drives the horizon across
  // every tab. Falls back to 2026 (the seed default) when not set.
  const firstCalendarYear = scenario.firstYearLabel ?? 2026;
  const monthCount = periods.length > 0 ? periods.length : FORECAST_HORIZON_MONTHS;
  const scenarioPeriods = buildScenarioPeriods(firstCalendarYear, monthCount);
  const horizon = scenarioPeriods.map((p) => p.key);
  const accountByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const baseRateBps = scenario.baseRateBps ?? 0;
  const loanBookGrowthPctByYear: string[] = (scenario.loanBookGrowthPctByYear ?? []).map(
    (d) => d.toString(),
  );

  // Book growth profiles are kept on the model but currently inert. Synthetic
  // loan generation was disabled because the in-memory rows didn't carry the
  // full field set (asset/state/borrower/etc.) that the rest of the app
  // expects. The AI-driven Seed Loans modal is the supported path for adding
  // forward-looking loans; growth profile data is preserved on the scenario
  // so it can be re-enabled later without a migration.
  const fyGroups = buildFYGroups(scenarioPeriods);
  const growthProfiles: BookGrowthProfileRow[] = [];
  const engineLoans = inputs.loans;
  const pnl =
    horizon.length > 0
      ? computePnL(
          inputs.drivers,
          inputs.headcount,
          horizon,
          engineLoans,
          inputs.programFees,
          loanBookGrowthPctByYear,
          inputs.platformLicenses,
          inputs.programLiabilities,
          baseRateBps,
        )
      : null;

  // Compute full statements only when a tab needs them.
  const needsStatements =
    tab === "balance-sheet" ||
    tab === "cashflow" ||
    tab === "overview" ||
    tab === "valuation" ||
    tab === "pnl";
  const statements =
    needsStatements && horizon.length > 0
      ? computeStatements(
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
          engineLoans,
          inputs.programFees,
          inputs.platformLicenses,
          inputs.programLiabilities,
        )
      : null;

  const overviewData: OverviewData | null = statements
    ? buildOverviewData(
        buildFYGroups(scenarioPeriods),
        statements.pnl.revenue.lines,
        statements.pnl.opex.lines,
        statements.pnl,
        accountByCode,
      )
    : null;

  const valuationData: ValuationData | null = statements
    ? (() => {
        const v = computeValuation(
          buildFYGroups(scenarioPeriods),
          {
            revenueTotals: statements.pnl.revenue.totals,
            ebitda: statements.pnl.ebitda,
            ebit: statements.pnl.ebit,
            netIncome: statements.pnl.netIncome,
            netCashMovement: statements.cf.netCashMovement,
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
        return {
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
        };
      })()
    : null;

  const cashflowData: CashflowData | null = statements
    ? (() => {
        const cf = statements.cf;
        const totalNetIncome = cf.netIncome.reduce(
          (acc, m) => acc + Number(m.value.toFixed(2)),
          0,
        );
        const totalCashMovement = cf.netCashMovement.reduce(
          (acc, m) => acc + Number(m.value.toFixed(2)),
          0,
        );
        return {
          horizon: statements.horizon,
          groups: buildFYGroups(scenarioPeriods),
          netIncome: serializeSeries(cf.netIncome),
          depreciation: serializeSeries(cf.depreciation),
          changeInAr: serializeSeries(cf.changeInAr),
          changeInAp: serializeSeries(cf.changeInAp),
          capexOutflow: serializeSeries(cf.capexOutflow),
          notesIssuance: serializeSeries(cf.notesIssuance),
          notesRepayment: serializeSeries(cf.notesRepayment),
          netCashMovement: serializeSeries(cf.netCashMovement),
          endingCash: serializeSeries(cf.endingCash),
          openingCash: scenario.openingCash?.toString() ?? "0",
          closingCash: cf.endingCash[cf.endingCash.length - 1].value.toFixed(2),
          totalNetIncome: totalNetIncome.toFixed(2),
          totalCashMovement: totalCashMovement.toFixed(2),
        };
      })()
    : null;

  const balanceSheetData: BalanceSheetData | null = statements
    ? {
        horizon: statements.horizon,
        groups: buildFYGroups(scenarioPeriods),
        cash: serializeSeries(statements.bs.cash),
        ar: serializeSeries(statements.bs.ar),
        ppeGross: serializeSeries(statements.bs.ppeGross),
        accumulatedDepreciation: serializeSeries(statements.bs.accumulatedDepreciation),
        ppeNet: serializeSeries(statements.bs.ppeNet),
        totalAssets: serializeSeries(statements.bs.totalAssets),
        ap: serializeSeries(statements.bs.ap),
        notesPayable: serializeSeries(statements.bs.notesPayable),
        equity: serializeSeries(statements.bs.equity),
        totalLiabilitiesAndEquity: serializeSeries(statements.bs.totalLiabilitiesAndEquity),
        closingCash: statements.bs.cash[statements.bs.cash.length - 1].value.toFixed(2),
        closingEquity: statements.bs.equity[statements.bs.equity.length - 1].value.toFixed(2),
        closingTotalAssets:
          statements.bs.totalAssets[statements.bs.totalAssets.length - 1].value.toFixed(2),
        assumptions: {
          dsoDays: scenario.dsoDays?.toString(),
          dpoDays: scenario.dpoDays?.toString(),
          taxRatePct: scenario.taxRatePct?.toString(),
          openingCash: scenario.openingCash?.toString(),
          openingEquity: scenario.openingEquity?.toString(),
        },
      }
    : null;
  const firstPeriod = horizon[0] ?? "";
  const revenueAccounts = accounts.filter((a) => a.type === "revenue");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");
  const groups = buildFYGroups(scenarioPeriods);
  const addDriverAction = addDriver.bind(null, id);

  const defaultCpiPct = scenario.defaultCpiPct?.toString();
  const defaultSuperPct = scenario.defaultSuperPct?.toString() ?? "12";

  // Plain-object copy so it can cross the server/client boundary cleanly.
  const staffRows: StaffRow[] = headcountDocs.map((h) => ({
    _id: String(h._id),
    personName: h.personName,
    role: h.role,
    accountCode: h.accountCode,
    employmentType: h.employmentType,
    ftePct: h.ftePct ? { toString: () => h.ftePct!.toString() } : undefined,
    band: h.band,
    tier: h.tier,
    startPeriodKey: h.startPeriodKey,
    endPeriodKey: h.endPeriodKey,
    salaryAnnual: { toString: () => h.salaryAnnual.toString() },
    superPct: h.superPct ? { toString: () => h.superPct!.toString() } : undefined,
    onCostPct: { toString: () => h.onCostPct.toString() },
    salaryGrowthPctAnnual: { toString: () => h.salaryGrowthPctAnnual.toString() },
  }));

  const paybandRows: PaybandRow[] = paybands.map((p) => ({
    band: p.band,
    tier: p.tier,
    salaryAnnual: p.salaryAnnual ? { toString: () => p.salaryAnnual!.toString() } : undefined,
    caseByCase: p.caseByCase,
  }));

  return (
    <div className="flex h-screen flex-col bg-zinc-50 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-xs text-zinc-500 hover:underline">
            ← Scenarios
          </Link>
          <span className="text-zinc-300">/</span>
          <h1 className="text-base font-semibold tracking-tight">{scenario.name}</h1>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {scenario.status}
          </span>
        </div>
        <div className="flex gap-6 text-xs">
          <span className="text-zinc-500">
            Drivers <span className="font-semibold text-zinc-900">{drivers.length}</span>
          </span>
          <span className="text-zinc-500">
            Staff <span className="font-semibold text-zinc-900">{headcountDocs.length}</span>
          </span>
          <span className="text-zinc-500">
            Revenue 5y{" "}
            <span className="font-semibold text-zinc-900">
              {pnl ? fmtMoney2(pnl.revenue.total.toFixed(2)) : "—"}
            </span>
          </span>
          <span className="text-zinc-500">
            OPEX 5y{" "}
            <span className="font-semibold text-zinc-900">
              {pnl ? fmtMoney2(pnl.opex.total.toFixed(2)) : "—"}
            </span>
          </span>
          <span className="text-zinc-500">
            Net income 5y{" "}
            <span
              className={`font-semibold ${
                statements && Number(statements.pnl.netIncomeTotal.toFixed(2)) >= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
            >
              {statements ? fmtMoney2(statements.pnl.netIncomeTotal.toFixed(2)) : "—"}
            </span>
          </span>
        </div>
      </header>

      {periods.length === 0 ? (
        <div className="border-b border-zinc-200 bg-white px-6 py-2 text-sm text-amber-700">
          Periods aren&apos;t seeded yet. Run <code className="font-mono">npm run seed</code> first.
        </div>
      ) : null}

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === "overview" &&
          (overviewData ? (
            <OverviewTab data={overviewData} />
          ) : (
            <Stub title="Overview" message="Seed periods first — run `npm run seed`." />
          ))}

        {tab === "loan-book" && (
          <LoansTab
            scenarioId={id}
            loans={loanRows}
            baseRateBps={baseRateBps}
            fys={fyGroups.map((g) => g.fy)}
            growthProfiles={growthProfiles}
            programs={programOptions}
            seedEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
          />
        )}

        {tab === "platform-revenues" && (
          <PlatformRevenuesTab
            scenarioId={id}
            licenses={licenseRows}
            defaultStartPeriod={firstPeriod}
            fys={buildFYGroups(scenarioPeriods).map((g) => g.fy)}
          />
        )}

        {tab === "capital-programs" && (
          <ProgramsTab
            scenarioId={id}
            programs={programRows}
            aggregates={programAggregates}
            baseRateBps={scenario.baseRateBps ?? 420}
            expenseAccounts={accounts
              .filter((a) => a.type === "revenue")
              .map((a) => ({ code: a.code, name: a.name }))}
            defaultStartPeriod={firstPeriod}
            seedEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
          />
        )}

        {tab === "opex-staffing" && (
          <StaffingTab
            scenarioId={id}
            staff={staffRows}
            paybands={paybandRows}
            expenseAccounts={expenseAccounts.map((a) => ({ code: a.code, name: a.name }))}
            defaultStartPeriod={firstPeriod}
            defaultCpiPct={defaultCpiPct}
            defaultSuperPct={defaultSuperPct}
          />
        )}

        {tab === "pnl" && (
          <div className="h-full overflow-auto bg-white">
            {!pnl ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Seed periods first.
              </div>
            ) : pnl.revenue.lines.length + pnl.opex.lines.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Add a driver or staff to see the P&amp;L.
              </div>
            ) : (
              <PnlTable
                pnl={pnl}
                groups={groups}
                accountByCode={accountByCode}
                cascade={
                  statements
                    ? {
                        ebitda: monthlyMap(statements.pnl.ebitda),
                        depreciation: monthlyMap(statements.pnl.depreciation),
                        ebit: monthlyMap(statements.pnl.ebit),
                        interestExpense: monthlyMap(statements.pnl.interestExpense),
                        pretaxIncome: monthlyMap(statements.pnl.pretaxIncome),
                        taxExpense: monthlyMap(statements.pnl.taxExpense),
                        netIncome: monthlyMap(statements.pnl.netIncome),
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}

        {tab === "revenue" && (
          <div className="flex h-full flex-col bg-white">
            <form
              action={addDriverAction}
              className="flex flex-wrap items-end gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs"
            >
              <input type="hidden" name="type" value="recurring_revenue" />
              <FormField label="Driver name">
                <input
                  name="name"
                  required
                  className="w-48 rounded-md border border-zinc-300 px-2 py-1"
                />
              </FormField>
              <FormField label="Revenue account">
                <select
                  name="accountCode"
                  required
                  defaultValue=""
                  className="w-56 rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {revenueAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Start" hint="YYYY-MM">
                <input
                  name="startPeriodKey"
                  required
                  defaultValue={firstPeriod}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </FormField>
              <FormField label="Base $ / month">
                <input
                  name="baseMonthly"
                  defaultValue="0"
                  inputMode="decimal"
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </FormField>
              <FormField label="Growth % / month">
                <input
                  name="monthlyGrowthPct"
                  defaultValue="0"
                  inputMode="decimal"
                  className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </FormField>
              <button
                type="submit"
                className="ml-auto rounded-md bg-zinc-900 px-4 py-1.5 font-medium text-white hover:bg-zinc-700"
              >
                Add revenue driver
              </button>
            </form>
            <div className="flex-1 overflow-auto">
              {pnl && pnl.revenue.lines.length > 0 ? (
                <PnlTable
                  pnl={pnl}
                  groups={groups}
                  accountByCode={accountByCode}
                  showSection="revenue"
                />
              ) : (
                <Stub
                  title="No revenue drivers yet"
                  message="Add a revenue driver above. More driver types (fee × volume, one-off) coming to this tab soon — use the API for now."
                />
              )}
            </div>
          </div>
        )}

        {tab === "opex-general" && (
          <OpexGeneralTab
            scenarioId={id}
            drivers={opexDriverRows}
            expenseAccounts={expenseAccounts.map((a) => ({ code: a.code, name: a.name }))}
            defaultStartPeriod={firstPeriod}
            pnl={pnl}
            groups={groups}
            accountByCode={accountByCode}
          />
        )}

        {tab === "balance-sheet" &&
          (balanceSheetData ? (
            <BalanceSheetTab data={balanceSheetData} />
          ) : (
            <Stub
              title="Balance Sheet"
              message="Seed periods first — run `npm run seed`."
            />
          ))}

        {tab === "cashflow" &&
          (cashflowData ? (
            <CashflowTab data={cashflowData} />
          ) : (
            <Stub
              title="Cashflow"
              message="Seed periods first — run `npm run seed`."
            />
          ))}

        {tab === "valuation" &&
          (valuationData ? (
            <ValuationTab scenarioId={id} data={valuationData} />
          ) : (
            <Stub
              title="Valuation"
              message="Seed periods first — run `npm run seed`."
            />
          ))}

        {tab === "control-panel" && (
          <ControlPanelTab
            scenarioId={id}
            initial={{
              name: scenario.name,
              status: scenario.status as "draft" | "active" | "archived",
              baseRateType: scenario.baseRateType,
              baseRateBps: scenario.baseRateBps,
              firstYearLabel: scenario.firstYearLabel,
            }}
            horizonYears={buildFYGroups(scenarioPeriods).length}
          />
        )}
      </div>

      {/* Bottom tab bar — spreadsheet-style */}
      <TabBar scenarioId={id} active={tab} />
    </div>
  );
}
