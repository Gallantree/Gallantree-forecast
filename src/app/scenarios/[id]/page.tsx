import { Types } from "mongoose";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserMenu } from "@/app/_components/UserMenu";
import { buildScenarioPeriods, FORECAST_HORIZON_MONTHS } from "@/constants/periods";
import { loadEngineInputs } from "@/engine/inputs";
import { computePnL, type MonthlyValue } from "@/engine/pnl";
import { computeStatements } from "@/engine/statements";
import { computeValuation } from "@/engine/valuation";
import { assertScenarioAccess } from "@/lib/assertScenarioAccess";
import { getCurrentUser } from "@/lib/currentUser";
import { connectToDatabase } from "@/lib/db";
import {
  Account,
  CapitalProgram,
  CapitalRaise,
  Driver,
  Headcount,
  Loan,
  Payband,
  Period,
  PlatformLicense,
  Scenario,
} from "@/models";
import { addDriver } from "./_actions";
import {
  type BalanceSheetData,
  BalanceSheetTab,
  type SerializedSeries,
} from "./_components/BalanceSheetTab";
import { type CapitalRaiseRow, CapitalRaisesTab } from "./_components/CapitalRaisesTab";
import { type CashflowData, CashflowTab } from "./_components/CashflowTab";
import { ConsolidatedModal } from "./_components/ConsolidatedModal";
import { ControlPanelTab } from "./_components/ControlPanelTab";
import { buildGallantreeStatements } from "./_components/gallantreeStatements";
import { LoanBookAnalysisTab } from "./_components/LoanBookAnalysisTab";
import {
  type BookGrowthProfileRow,
  type LoanRow,
  LoansTab,
  type ProgramOption,
  type ProgramTypeKey,
} from "./_components/LoansTab";
import { buildLoanAnalysisData } from "./_components/loanAnalysisData";
import { type OpexDriverRow, OpexGeneralTab } from "./_components/OpexGeneralTab";
import { type OverviewData, OverviewTab } from "./_components/OverviewTab";
import { buildOverviewData, toGallantreeOverview } from "./_components/overviewData";
import { type PlatformLicenseRow, PlatformRevenuesTab } from "./_components/PlatformRevenuesTab";
import { PnlAnalysisModal } from "./_components/PnlAnalysisModal";
import { buildFYGroups, PnlTable, toGallantreePnl } from "./_components/PnlTable";
import {
  isFundingTranche,
  type ProgramAggregate,
  type ProgramRow,
  ProgramsTab,
} from "./_components/ProgramsTab";
import { buildProgramAnalysisData } from "./_components/programAnalysisData";
import { type PaybandRow, StaffingTab, type StaffRow } from "./_components/StaffingTab";
import { defaultTabFor, isTabKeyForMode, TabBar, type TabKey } from "./_components/TabBar";
import {
  type UofMonthlyByAccount,
  type UseOfFundsData,
  UseOfFundsTab,
} from "./_components/UseOfFundsTab";
import { type ValuationData, ValuationTab } from "./_components/ValuationTab";

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

  await connectToDatabase();

  const me = await getCurrentUser();
  const access = await assertScenarioAccess(id, me);
  if (!access.ok) notFound();

  const scenario = await Scenario.findById(id).lean<{
    name: string;
    status: string;
    viewMode?: "all" | "gallantree";
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
    staffTargetByYear?: number[];
    waccPct?: { toString: () => string };
    terminalGrowthPct?: { toString: () => string };
    evEbitdaMultiple?: { toString: () => string };
    evRevenueMultiple?: { toString: () => string };
    peMultiple?: { toString: () => string };
    netDebt?: { toString: () => string };
  }>();
  if (!scenario) notFound();

  const viewMode = scenario.viewMode ?? "all";
  const tab: TabKey = isTabKeyForMode(rawTab, viewMode) ? rawTab : defaultTabFor(viewMode);

  const [
    periods,
    accounts,
    drivers,
    headcountDocs,
    paybands,
    loanDocs,
    programDocs,
    licenseDocs,
    raiseDocs,
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
    CapitalProgram.find({ scenarioId: id }).sort({ startPeriodKey: 1, name: 1 }).lean(),
    PlatformLicense.find({ scenarioId: id }).sort({ type: 1, startPeriodKey: 1, name: 1 }).lean(),
    CapitalRaise.find({ scenarioId: id }).sort({ raiseDate: 1, name: 1 }).lean(),
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
    arrearsStatus?: "current" | "arrears30" | "arrears60" | "arrears90" | "default";
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
      arrearsStatus: l.arrearsStatus ?? "current",
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
  const licenseRows: PlatformLicenseRow[] = (licenseDocs as unknown as LeanLicense[]).map((l) => ({
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
    monthlyFee: l.monthlyFee ? { toString: () => l.monthlyFee!.toString() } : undefined,
    configFee: l.configFee ? { toString: () => l.configFee!.toString() } : undefined,
    aumByYear: l.aumByYear ? l.aumByYear.map((v) => ({ toString: () => v.toString() })) : undefined,
    feePctOfAumByYear: l.feePctOfAumByYear
      ? l.feePctOfAumByYear.map((v) => ({ toString: () => v.toString() }))
      : undefined,
  }));

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
      (d) => d.type === "opex_fixed" || d.type === "opex_pct_revenue" || d.type === "opex_per_fte",
    )
    .map((d) => ({
      _id: d._id.toString(),
      type: d.type as OpexDriverRow["type"],
      name: d.name,
      accountCode: d.accountCode,
      startPeriodKey: d.startPeriodKey,
      endPeriodKey: d.endPeriodKey,
      baseMonthly: d.baseMonthly ? { toString: () => d.baseMonthly!.toString() } : undefined,
      monthlyGrowthPct: d.monthlyGrowthPct
        ? { toString: () => d.monthlyGrowthPct!.toString() }
        : undefined,
      pctOfRevenue: d.pctOfRevenue ? { toString: () => d.pctOfRevenue!.toString() } : undefined,
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
      startPeriodKey?: string;
      endPeriodKey?: string;
    }>
  ).map((p) => ({
    _id: p._id.toString(),
    name: p.name,
    type: p.type,
    startPeriodKey: p.startPeriodKey,
    endPeriodKey: p.endPeriodKey,
  }));

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
    programAggregates[pid] ??= {
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
    };
    const bucket = programAggregates[pid];
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
  const programRows: ProgramRow[] = (
    programDocs as unknown as Array<{
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
      upfrontFees?: Array<{
        _id: { toString: () => string };
        name: string;
        category: "underwriter" | "legal" | "credit_rating" | "other";
        amount: { toString: () => string };
        accountCode?: string;
      }>;
      arrearsPctTarget?: { toString: () => string };
      gallantreeSharePct?: { toString: () => string };
      rampUpMonths?: number;
      amortisationMonths?: number;
      captiveEquityHoldings?: Array<{
        _id?: { toString: () => string };
        programId: { toString: () => string };
        trancheName: string;
      }>;
    }>
  ).map((p) => ({
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
    upfrontFees: (p.upfrontFees ?? []).map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      category: u.category,
      amount: { toString: () => u.amount.toString() },
      accountCode: u.accountCode,
    })),
    arrearsPctTarget: p.arrearsPctTarget
      ? { toString: () => p.arrearsPctTarget!.toString() }
      : undefined,
    gallantreeSharePct: p.gallantreeSharePct
      ? { toString: () => p.gallantreeSharePct!.toString() }
      : undefined,
    rampUpMonths: p.rampUpMonths,
    amortisationMonths: p.amortisationMonths,
    captiveEquityHoldings: (p.captiveEquityHoldings ?? []).map((h) => ({
      programId: h.programId.toString(),
      trancheName: h.trancheName,
    })),
  }));

  const raiseRows: CapitalRaiseRow[] = (
    raiseDocs as unknown as Array<{
      _id: { toString: () => string };
      name: string;
      type: "equity" | "convertible_note";
      raiseDate: Date;
      targetSize: { toString: () => string };
      discountPct?: { toString: () => string };
      valuationCap?: { toString: () => string };
      pricePerUnit?: { toString: () => string };
      investors: Array<{
        _id: { toString: () => string };
        name: string;
        commitment: { toString: () => string };
        fundingDate: Date;
        numNotes?: number;
        status: "committed" | "funded" | "withdrawn";
        notes?: string;
      }>;
      useOfFundsPlan?: {
        coverMonths: number;
        contingencyPct: { toString: () => string };
        includeRevenue: boolean;
        manualLines?: Array<{ label: string; amount: { toString: () => string } }>;
      };
    }>
  ).map((r) => ({
    _id: r._id.toString(),
    name: r.name,
    type: r.type,
    raiseDate: new Date(r.raiseDate).toISOString(),
    targetSize: r.targetSize.toString(),
    discountPct: r.discountPct?.toString(),
    valuationCap: r.valuationCap?.toString(),
    pricePerUnit: r.pricePerUnit?.toString(),
    investors: r.investors.map((inv) => ({
      _id: inv._id.toString(),
      name: inv.name,
      commitment: inv.commitment.toString(),
      fundingDate: new Date(inv.fundingDate).toISOString(),
      numNotes: inv.numNotes,
      status: inv.status,
      notes: inv.notes,
    })),
    useOfFundsPlan: r.useOfFundsPlan
      ? {
          coverMonths: r.useOfFundsPlan.coverMonths,
          contingencyPct: Number(r.useOfFundsPlan.contingencyPct.toString()),
          includeRevenue: !!r.useOfFundsPlan.includeRevenue,
          manualLines: (r.useOfFundsPlan.manualLines ?? []).map((l) => ({
            label: l.label,
            amount: Number(l.amount.toString()),
          })),
        }
      : undefined,
  }));

  // Year 1 calendar year from the Control Panel — drives the horizon across
  // every tab. Falls back to 2026 (the seed default) when not set.
  const firstCalendarYear = scenario.firstYearLabel ?? 2026;
  const monthCount = periods.length > 0 ? periods.length : FORECAST_HORIZON_MONTHS;
  const scenarioPeriods = buildScenarioPeriods(firstCalendarYear, monthCount);
  const horizon = scenarioPeriods.map((p) => p.key);
  const accountByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const baseRateBps = scenario.baseRateBps ?? 0;
  const loanBookGrowthPctByYear: string[] = (scenario.loanBookGrowthPctByYear ?? []).map((d) =>
    d.toString(),
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
  // Statements feed several tabs AND the header summary tiles + the
  // Consolidated modal button. Compute them whenever the scenario has any
  // periods to project against — cheaper than conditional toggling and
  // keeps the header consistent across tabs.
  const needsStatements = true;
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
          inputs.capitalRaises,
          inputs.programUpfrontFees,
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
        const totalNetIncome = cf.netIncome.reduce((acc, m) => acc + Number(m.value.toFixed(2)), 0);
        const totalCashMovement = cf.netCashMovement.reduce(
          (acc, m) => acc + Number(m.value.toFixed(2)),
          0,
        );
        return {
          horizon: statements.horizon,
          groups: buildFYGroups(scenarioPeriods),
          netIncome: serializeSeries(cf.netIncome),
          depreciation: serializeSeries(cf.depreciation),
          issuanceAmortisation: serializeSeries(cf.issuanceAmortisation),
          changeInAr: serializeSeries(cf.changeInAr),
          changeInAp: serializeSeries(cf.changeInAp),
          changeInDeferredRevenue: serializeSeries(cf.changeInDeferredRevenue),
          capexOutflow: serializeSeries(cf.capexOutflow),
          issuanceCostOutflow: serializeSeries(cf.issuanceCostOutflow),
          notesIssuance: serializeSeries(cf.notesIssuance),
          notesRepayment: serializeSeries(cf.notesRepayment),
          equityProceeds: serializeSeries(cf.equityProceeds),
          convertibleProceeds: serializeSeries(cf.convertibleProceeds),
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
        prepaidIssuanceCosts: serializeSeries(statements.bs.prepaidIssuanceCosts),
        totalAssets: serializeSeries(statements.bs.totalAssets),
        ap: serializeSeries(statements.bs.ap),
        notesPayable: serializeSeries(statements.bs.notesPayable),
        deferredRevenue: serializeSeries(statements.bs.deferredRevenue),
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

  // Gallantree-only variants of BS / CF / Valuation. Recomputed from the
  // engine output by stripping NIM revenue, program-tranche debt, and
  // program-issuance items. See gallantreeStatements.ts.
  const gallantreeStatements =
    viewMode === "gallantree" && statements
      ? buildGallantreeStatements({
          statements,
          groups: buildFYGroups(scenarioPeriods),
          scenarioAssumptions: {
            dsoDays: scenario.dsoDays?.toString(),
            dpoDays: scenario.dpoDays?.toString(),
            taxRatePct: scenario.taxRatePct?.toString(),
            openingCash: scenario.openingCash?.toString(),
            openingEquity: scenario.openingEquity?.toString(),
          },
          valuationAssumptions: {
            waccPct: scenario.waccPct?.toString(),
            terminalGrowthPct: scenario.terminalGrowthPct?.toString(),
            evEbitdaMultiple: scenario.evEbitdaMultiple?.toString(),
            evRevenueMultiple: scenario.evRevenueMultiple?.toString(),
            peMultiple: scenario.peMultiple?.toString(),
            netDebt: scenario.netDebt?.toString(),
          },
        })
      : null;
  const effectiveBalanceSheetData = gallantreeStatements?.balanceSheet ?? balanceSheetData;
  const effectiveCashflowData = gallantreeStatements?.cashflow ?? cashflowData;
  const effectiveValuationData = gallantreeStatements?.valuation ?? valuationData;

  // ── Use of Funds tab data ──────────────────────────────────────────────
  const useOfFundsData: UseOfFundsData | null = statements
    ? (() => {
        const opexLinesByAccount: UofMonthlyByAccount[] = statements.pnl.opex.lines.map((l) => {
          const monthly: Record<string, number> = {};
          for (const m of l.monthly) monthly[m.periodKey] = Number(m.value.toString());
          return {
            accountCode: l.accountCode,
            accountName: accountByCode.get(l.accountCode) ?? l.accountCode,
            monthly,
          };
        });
        const revenueLinesByAccount: UofMonthlyByAccount[] = statements.pnl.revenue.lines.map(
          (l) => {
            const monthly: Record<string, number> = {};
            for (const m of l.monthly) monthly[m.periodKey] = Number(m.value.toString());
            return {
              accountCode: l.accountCode,
              accountName: accountByCode.get(l.accountCode) ?? l.accountCode,
              monthly,
            };
          },
        );
        const issuanceCostByMonth: Record<string, number> = {};
        for (const m of statements.cf.issuanceCostOutflow) {
          issuanceCostByMonth[m.periodKey] = Number(m.value.toString());
        }
        const raises = raiseRows.map((r) => {
          const raiseDateObj = new Date(r.raiseDate);
          const y = raiseDateObj.getUTCFullYear();
          const mo = raiseDateObj.getUTCMonth() + 1;
          const raisePeriodKey = `${y}-${String(mo).padStart(2, "0")}`;
          let fundedAmount = 0;
          let committedAmount = 0;
          for (const inv of r.investors) {
            const v = Number(inv.commitment);
            if (!Number.isFinite(v)) continue;
            if (inv.status === "funded") fundedAmount += v;
            else if (inv.status === "committed") committedAmount += v;
          }
          return {
            _id: r._id,
            name: r.name,
            type: r.type,
            raiseDate: r.raiseDate,
            raisePeriodKey,
            targetSize: Number(r.targetSize),
            fundedAmount,
            committedAmount,
            plan: r.useOfFundsPlan ?? null,
          };
        });
        return {
          raises,
          horizon: statements.horizon,
          opexLinesByAccount,
          revenueLinesByAccount,
          issuanceCostByMonth,
        };
      })()
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
    isGrowth: h.isGrowth ?? false,
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
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
              viewMode === "gallantree"
                ? "bg-indigo-100 text-indigo-800"
                : "bg-zinc-200 text-zinc-700"
            }`}
            title="Scenario profile"
          >
            {viewMode === "gallantree" ? "Gallantree view" : "All"}
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs">
          <div className="ml-2 border-l border-zinc-200 pl-4">
            <UserMenu user={me} />
          </div>
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

        {tab === "overview-gallantree" &&
          (overviewData ? (
            <OverviewTab data={toGallantreeOverview(overviewData)} />
          ) : (
            <Stub
              title="Overview — Gallantree"
              message="Seed periods first — run `npm run seed`."
            />
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

        {tab === "loan-book-analysis" && (
          <LoanBookAnalysisTab data={buildLoanAnalysisData(loanRows)} />
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
            analysisData={buildProgramAnalysisData(
              programRows,
              programAggregates,
              scenario.baseRateBps ?? 420,
              fyGroups.map((g) => g.fy),
            )}
          />
        )}

        {tab === "capital-raises" && <CapitalRaisesTab scenarioId={id} raises={raiseRows} />}

        {tab === "opex-staffing" && (
          <StaffingTab
            scenarioId={id}
            staff={staffRows}
            paybands={paybandRows}
            expenseAccounts={expenseAccounts.map((a) => ({ code: a.code, name: a.name }))}
            defaultStartPeriod={firstPeriod}
            defaultCpiPct={defaultCpiPct}
            defaultSuperPct={defaultSuperPct}
            fys={fyGroups.map((g) => g.fy)}
            staffTargetByYear={scenario.staffTargetByYear ?? undefined}
          />
        )}

        {tab === "pnl" && (
          <div className="flex h-full flex-col bg-white">
            {overviewData ? (
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                <PnlAnalysisModal data={overviewData} />
                <ConsolidatedModal data={overviewData} />
              </div>
            ) : null}
            <div className="flex-1 overflow-auto">
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
                          issuanceAmortisation: monthlyMap(statements.pnl.issuanceAmortisation),
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
          </div>
        )}

        {tab === "pnl-gallantree" && (
          <div className="flex h-full flex-col bg-white">
            {overviewData ? (
              <div className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                <PnlAnalysisModal
                  data={toGallantreeOverview(overviewData)}
                  title="P&L analysis — Gallantree"
                  subtitle="Gallantree's own operating economics — NIM revenue & program interest excluded"
                />
                <ConsolidatedModal
                  data={toGallantreeOverview(overviewData)}
                  title="Consolidated five-year view — Gallantree"
                  subtitle="Gallantree's own operating economics — NIM revenue & program interest excluded"
                />
              </div>
            ) : null}
            <div className="flex-1 overflow-auto">
              {!pnl ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                  Seed periods first.
                </div>
              ) : pnl.revenue.lines.length + pnl.opex.lines.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                  Add a driver or staff to see the P&amp;L.
                </div>
              ) : (
                (() => {
                  // Filter out NIM revenue (accounts 4100-4499) + zero out
                  // capital-program interest expense. Same data shape, same
                  // renderer — just Gallantree's operating economics.
                  const standardCascade = statements
                    ? {
                        ebitda: monthlyMap(statements.pnl.ebitda),
                        depreciation: monthlyMap(statements.pnl.depreciation),
                        issuanceAmortisation: monthlyMap(statements.pnl.issuanceAmortisation),
                        ebit: monthlyMap(statements.pnl.ebit),
                        interestExpense: monthlyMap(statements.pnl.interestExpense),
                        pretaxIncome: monthlyMap(statements.pnl.pretaxIncome),
                        taxExpense: monthlyMap(statements.pnl.taxExpense),
                        netIncome: monthlyMap(statements.pnl.netIncome),
                      }
                    : undefined;
                  const filtered = toGallantreePnl(pnl, standardCascade);
                  return (
                    <PnlTable
                      pnl={filtered.pnl}
                      groups={groups}
                      accountByCode={accountByCode}
                      cascade={filtered.cascade}
                    />
                  );
                })()
              )}
            </div>
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
          (effectiveBalanceSheetData ? (
            <BalanceSheetTab scenarioId={id} data={effectiveBalanceSheetData} />
          ) : (
            <Stub title="Balance Sheet" message="Seed periods first — run `npm run seed`." />
          ))}

        {tab === "cashflow" &&
          (effectiveCashflowData ? (
            <CashflowTab scenarioId={id} data={effectiveCashflowData} />
          ) : (
            <Stub title="Cashflow" message="Seed periods first — run `npm run seed`." />
          ))}

        {tab === "valuation" &&
          (effectiveValuationData ? (
            <ValuationTab scenarioId={id} data={effectiveValuationData} />
          ) : (
            <Stub title="Valuation" message="Seed periods first — run `npm run seed`." />
          ))}

        {tab === "use-of-funds" &&
          (useOfFundsData ? (
            <UseOfFundsTab scenarioId={id} data={useOfFundsData} />
          ) : (
            <Stub title="Use of Funds" message="Seed periods + add a capital raise first." />
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
              taxRatePct: scenario.taxRatePct?.toString(),
            }}
            horizonYears={buildFYGroups(scenarioPeriods).length}
          />
        )}
      </div>

      {/* Bottom tab bar — spreadsheet-style */}
      <TabBar scenarioId={id} active={tab} viewMode={viewMode} />
    </div>
  );
}
