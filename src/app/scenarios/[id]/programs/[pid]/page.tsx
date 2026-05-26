import Decimal from "decimal.js";
import { Types } from "mongoose";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserMenu } from "@/app/_components/UserMenu";
import { assertScenarioAccess } from "@/lib/assertScenarioAccess";
import { getCurrentUser } from "@/lib/currentUser";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram, Loan, Scenario } from "@/models";
import { fmtMoney2 } from "@/utils/format";
import type { LoanRow } from "../../_components/LoansTab";
import {
  isFundingTranche,
  type ProgramAggregate,
  type ProgramRow,
} from "../../_components/ProgramsTab";
import { ProgramBondEconomicsTab } from "./_components/ProgramBondEconomicsTab";
import { ProgramDetailTabBar } from "./_components/ProgramDetailTabBar";
import { ProgramLiabilitiesTab } from "./_components/ProgramLiabilitiesTab";
import { ProgramLoanBookTab } from "./_components/ProgramLoanBookTab";
import { ProgramOverviewTab } from "./_components/ProgramOverviewTab";
import { ProgramWaterfallTab } from "./_components/ProgramWaterfallTab";
import { ReturnProfileTab } from "./_components/ReturnProfileTab";
import {
  buildReturnProfileData,
  type UnderlyingProgramSnapshot,
} from "./_components/returnProfileData";

export const dynamic = "force-dynamic";

type ProgramTabKey =
  | "overview"
  | "loan-book"
  | "liabilities"
  | "waterfall"
  | "bond-economics"
  | "return-profile";
const PROGRAM_TABS: { key: ProgramTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "loan-book", label: "Loan Book" },
  { key: "liabilities", label: "Liabilities" },
  { key: "waterfall", label: "Waterfall" },
  { key: "bond-economics", label: "Bond Economics" },
  { key: "return-profile", label: "Return Profile" },
];

type Params = {
  params: Promise<{ id: string; pid: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function ProgramDetailPage({ params, searchParams }: Params) {
  const { id, pid } = await params;
  const { tab: rawTab } = await searchParams;

  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(pid)) notFound();

  await connectToDatabase();

  const me = await getCurrentUser();
  const access = await assertScenarioAccess(id, me);
  if (!access.ok) notFound();

  const scenario = await Scenario.findById(id).lean<{
    name: string;
    status: string;
    viewMode?: "all" | "gallantree";
    baseRateBps?: number;
    firstYearLabel?: number;
  }>();
  if (!scenario) notFound();

  type LeanProgram = {
    _id: { toString: () => string };
    scenarioId: { toString: () => string };
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
  };

  const programDoc = await CapitalProgram.findById(pid).lean<LeanProgram>();
  if (!programDoc) notFound();
  if (programDoc.scenarioId.toString() !== id) notFound();

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

  const loanDocs = await Loan.find({
    scenarioId: new Types.ObjectId(id),
    capitalProgramId: new Types.ObjectId(pid),
  })
    .sort({ loanId: 1 })
    .lean<LeanLoan[]>();

  const allProgramDocs = await CapitalProgram.find({ scenarioId: new Types.ObjectId(id) })
    .select("_id name type")
    .lean<{ _id: { toString: () => string }; name: string; type: string }[]>();
  const allPrograms = allProgramDocs.map((p) => ({
    _id: p._id.toString(),
    name: p.name,
    type: p.type,
  }));

  // For MIT_FUND programs, fetch the underlying programs whose equity tranches
  // this fund holds (and their loan books) so we can build the return profile.
  const isMitFund = programDoc.type === "MIT_FUND";
  const heldProgramIds = isMitFund
    ? Array.from(
        new Set((programDoc.captiveEquityHoldings ?? []).map((h) => h.programId.toString())),
      )
    : [];
  let underlyingSnapshots: UnderlyingProgramSnapshot[] = [];
  if (heldProgramIds.length > 0) {
    const objIds = heldProgramIds.map((s) => new Types.ObjectId(s));
    const underlyingDocs = await CapitalProgram.find({
      _id: { $in: objIds },
      scenarioId: new Types.ObjectId(id),
    }).lean<LeanProgram[]>();
    const underlyingLoans = await Loan.find({
      scenarioId: new Types.ObjectId(id),
      capitalProgramId: { $in: objIds },
    })
      .select("capitalProgramId balance creditSpreadBps")
      .lean<
        Array<{
          capitalProgramId: { toString: () => string };
          balance: { toString: () => string };
          creditSpreadBps?: number;
        }>
      >();
    const aggByProgram = new Map<string, { totalBalance: number; wSpread: number; wBal: number }>();
    for (const l of underlyingLoans) {
      const pid2 = l.capitalProgramId.toString();
      const bal = Number(l.balance.toString());
      const agg = aggByProgram.get(pid2) ?? { totalBalance: 0, wSpread: 0, wBal: 0 };
      agg.totalBalance += bal;
      if (l.creditSpreadBps !== undefined) {
        agg.wSpread += bal * l.creditSpreadBps;
        agg.wBal += bal;
      }
      aggByProgram.set(pid2, agg);
    }
    underlyingSnapshots = underlyingDocs.map((u) => {
      const agg = aggByProgram.get(u._id.toString()) ?? { totalBalance: 0, wSpread: 0, wBal: 0 };
      const assetWasBps = agg.wBal > 0 ? agg.wSpread / agg.wBal : 0;
      const programRow: ProgramRow = {
        _id: u._id.toString(),
        name: u.name,
        type: u.type,
        dealSize: u.dealSize ? { toString: () => u.dealSize!.toString() } : undefined,
        faceValuePerNote: u.faceValuePerNote
          ? { toString: () => u.faceValuePerNote!.toString() }
          : undefined,
        startPeriodKey: u.startPeriodKey,
        endPeriodKey: u.endPeriodKey,
        notes: u.notes,
        fees: u.fees.map((f) => ({
          _id: f._id.toString(),
          name: f.name,
          category: f.category,
          basisAmount: { toString: () => f.basisAmount.toString() },
          feeBps: f.feeBps,
          accountCode: f.accountCode,
        })),
        liabilities: (u.liabilities ?? []).map((l) => ({
          _id: l._id.toString(),
          name: l.name,
          numNotes: l.numNotes,
          returnProfileBps: l.returnProfileBps,
          calculationMethod: l.calculationMethod,
          rateType: l.rateType,
          accountCode: l.accountCode,
        })),
        upfrontFees: (u.upfrontFees ?? []).map((f) => ({
          _id: f._id.toString(),
          name: f.name,
          category: f.category,
          amount: { toString: () => f.amount.toString() },
          accountCode: f.accountCode,
        })),
        rampUpMonths: u.rampUpMonths,
        amortisationMonths: u.amortisationMonths,
      };
      return { program: programRow, totalBalance: agg.totalBalance, assetWasBps };
    });
  }

  const program: ProgramRow = {
    _id: programDoc._id.toString(),
    name: programDoc.name,
    type: programDoc.type,
    dealSize: programDoc.dealSize ? { toString: () => programDoc.dealSize!.toString() } : undefined,
    faceValuePerNote: programDoc.faceValuePerNote
      ? { toString: () => programDoc.faceValuePerNote!.toString() }
      : undefined,
    startPeriodKey: programDoc.startPeriodKey,
    endPeriodKey: programDoc.endPeriodKey,
    notes: programDoc.notes,
    fees: programDoc.fees.map((f) => ({
      _id: f._id.toString(),
      name: f.name,
      category: f.category,
      basisAmount: { toString: () => f.basisAmount.toString() },
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
    liabilities: (programDoc.liabilities ?? []).map((l) => ({
      _id: l._id.toString(),
      name: l.name,
      numNotes: l.numNotes,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode,
    })),
    upfrontFees: (programDoc.upfrontFees ?? []).map((u) => ({
      _id: u._id.toString(),
      name: u.name,
      category: u.category,
      amount: { toString: () => u.amount.toString() },
      accountCode: u.accountCode,
    })),
    arrearsPctTarget: programDoc.arrearsPctTarget
      ? { toString: () => programDoc.arrearsPctTarget!.toString() }
      : undefined,
    gallantreeSharePct: programDoc.gallantreeSharePct
      ? { toString: () => programDoc.gallantreeSharePct!.toString() }
      : undefined,
    rampUpMonths: programDoc.rampUpMonths,
    amortisationMonths: programDoc.amortisationMonths,
    captiveEquityHoldings: (programDoc.captiveEquityHoldings ?? []).map((h) => ({
      programId: h.programId.toString(),
      trancheName: h.trancheName,
    })),
  };

  const loans: LoanRow[] = loanDocs.map((l) => ({
    _id: l._id.toString(),
    loanId: l.loanId,
    borrower: l.borrower,
    lenderOfRecord: l.lenderOfRecord,
    state: l.state,
    assetClass: l.assetClass,
    propertyStatus: l.propertyStatus,
    location: l.location,
    capitalProgramId: pid,
    programType: program.type,
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
  }));

  // Compute program aggregate
  const face = program.faceValuePerNote ? Number(program.faceValuePerNote.toString()) : 0;
  let wNum = 0;
  let wDen = 0;
  for (const l of program.liabilities ?? []) {
    if (!isFundingTranche(l.name, l.returnProfileBps)) continue;
    const principal = (l.numNotes ?? 0) * face;
    if (principal <= 0) continue;
    wNum += principal * l.returnProfileBps;
    wDen += principal;
  }
  const fundingWasBps = wDen > 0 ? Math.round(wNum / wDen) : 0;

  const aggregate: ProgramAggregate = {
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
    fundingWasBps,
  };
  for (const l of loans) {
    const bal = Number(l.balance.toString());
    aggregate.loanCount += 1;
    aggregate.totalBalance += bal;
    if (l.internalScore !== undefined) {
      aggregate.weightSumScore += bal * l.internalScore;
      aggregate.weightBalanceForScore += bal;
    }
    if (l.lvr) {
      aggregate.weightSumLvr += bal * Number(l.lvr.toString());
      aggregate.weightBalanceForLvr += bal;
    }
    if (l.dscr) {
      aggregate.weightSumDscr += bal * Number(l.dscr.toString());
      aggregate.weightBalanceForDscr += bal;
    }
    if (l.creditSpreadBps !== undefined) {
      aggregate.weightSumSpreadBps += bal * l.creditSpreadBps;
      aggregate.weightBalanceForSpread += bal;
    }
  }

  const requestedTab = PROGRAM_TABS.some((t) => t.key === rawTab)
    ? (rawTab as ProgramTabKey)
    : "overview";
  // return-profile is only available on MIT_FUND programs; redirect others
  // back to overview so the URL never ends up on a hidden tab.
  const tab: ProgramTabKey =
    requestedTab === "return-profile" && programDoc.type !== "MIT_FUND" ? "overview" : requestedTab;

  const baseRateBps = scenario.baseRateBps ?? 0;

  const returnProfile = isMitFund
    ? buildReturnProfileData({
        fund: program,
        underlying: underlyingSnapshots,
        baseRateBps,
        firstYearLabel: scenario.firstYearLabel ?? 2026,
      })
    : null;

  const programAnnual = new Decimal(
    program.fees.reduce((acc, f) => acc + (Number(f.basisAmount.toString()) * f.feeBps) / 10000, 0),
  );
  const programUpfront = new Decimal(
    (program.upfrontFees ?? []).reduce((acc, u) => acc + Number(u.amount.toString()), 0),
  );

  const TYPE_LABEL: Record<ProgramRow["type"], string> = {
    CRE_CLO: "CRE CLO",
    CMBS: "CMBS",
    MIT_FUND: "MIT Fund",
    WAREHOUSE: "Warehouse",
    OTHER: "Other",
  };
  const TYPE_COLOR: Record<ProgramRow["type"], string> = {
    CRE_CLO: "bg-emerald-100 text-emerald-800",
    CMBS: "bg-sky-100 text-sky-800",
    MIT_FUND: "bg-violet-100 text-violet-800",
    WAREHOUSE: "bg-amber-100 text-amber-800",
    OTHER: "bg-zinc-100 text-zinc-700",
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-flex items-center" aria-label="Gallantree">
            <Image
              src="/gallantree-logo.png"
              alt="Gallantree"
              width={1356}
              height={216}
              priority
              className="h-7 w-auto"
            />
          </Link>
          <span className="text-zinc-300">|</span>
          <h1 className="text-sm font-semibold tracking-tight text-zinc-800">
            Gallantree Forecast
          </h1>
          <span className="text-zinc-300">/</span>
          <Link
            href={`/scenarios/${id}?tab=capital-programs`}
            className="text-xs text-zinc-500 hover:underline"
          >
            ← {scenario.name}
          </Link>
        </div>
        <UserMenu user={me} />
      </header>

      <div className="flex items-center justify-between border-b bg-zinc-900 px-6 py-3 text-white">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold">{program.name}</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${TYPE_COLOR[program.type]}`}
          >
            {TYPE_LABEL[program.type]}
          </span>
          <span className="font-mono text-[11px] text-zinc-400">
            {program.startPeriodKey}
            {program.endPeriodKey ? ` → ${program.endPeriodKey}` : ""}
          </span>
          {program.dealSize ? (
            <span className="text-[11px] text-zinc-400">
              Deal size{" "}
              <span className="font-semibold text-white">
                {fmtMoney2(program.dealSize.toString())}
              </span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-6 text-[11px] text-zinc-400">
          <span>
            Annual fees{" "}
            <span className="font-semibold text-emerald-400">
              {fmtMoney2(programAnnual.toFixed(2))}
            </span>
          </span>
          {programUpfront.gt(0) ? (
            <span>
              Upfront fees{" "}
              <span className="font-semibold text-rose-400">
                {fmtMoney2(programUpfront.toFixed(2))}
              </span>
            </span>
          ) : null}
        </div>
      </div>

      <ProgramDetailTabBar
        scenarioId={id}
        programId={pid}
        active={tab}
        showReturnProfile={isMitFund}
      />

      <main className="overflow-auto">
        {tab === "overview" && (
          <ProgramOverviewTab
            scenarioId={id}
            program={program}
            aggregate={aggregate}
            baseRateBps={baseRateBps}
          />
        )}
        {tab === "loan-book" && (
          <ProgramLoanBookTab
            loans={loans}
            program={program}
            aggregate={aggregate}
            scenarioId={id}
            programs={allPrograms}
          />
        )}
        {tab === "liabilities" && (
          <ProgramLiabilitiesTab
            program={program}
            baseRateBps={baseRateBps}
            scenarioId={id}
            programId={pid}
          />
        )}
        {tab === "waterfall" && (
          <ProgramWaterfallTab program={program} aggregate={aggregate} baseRateBps={baseRateBps} />
        )}
        {tab === "bond-economics" && (
          <ProgramBondEconomicsTab
            program={program}
            aggregate={aggregate}
            baseRateBps={baseRateBps}
          />
        )}
        {tab === "return-profile" && returnProfile && <ReturnProfileTab data={returnProfile} />}
      </main>
    </div>
  );
}
