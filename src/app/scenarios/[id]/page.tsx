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
} from "@/models";
import { fmtMoney2 } from "@/utils/format";
import { computePnL, type MonthlyValue } from "@/engine/pnl";
import { computeStatements } from "@/engine/statements";
import { loadEngineInputs } from "@/engine/inputs";
import { PnlTable, buildFYGroups } from "./_components/PnlTable";
import { TabBar, isTabKey, type TabKey } from "./_components/TabBar";
import { StaffingTab, type StaffRow, type PaybandRow } from "./_components/StaffingTab";
import { LoansTab, type LoanRow } from "./_components/LoansTab";
import { ProgramsTab, type ProgramRow } from "./_components/ProgramsTab";
import {
  BalanceSheetTab,
  type BalanceSheetData,
  type SerializedSeries,
} from "./_components/BalanceSheetTab";
import { CashflowTab, type CashflowData } from "./_components/CashflowTab";
import {
  OverviewTab,
  buildOverviewData,
  type OverviewData,
} from "./_components/OverviewTab";
import { addDriver } from "./_actions";

function serializeSeries(series: MonthlyValue[]): SerializedSeries {
  const monthly: Record<string, string> = {};
  for (const m of series) monthly[m.periodKey] = m.value.toFixed(2);
  return { monthly };
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
    nimTier?: "default" | "neg_floor" | "hard_floor";
    dsoDays?: { toString: () => string };
    dpoDays?: { toString: () => string };
    taxRatePct?: { toString: () => string };
    openingCash?: { toString: () => string };
    openingEquity?: { toString: () => string };
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
    inputs,
  ] = await Promise.all([
    Period.find({}).sort({ index: 1 }).lean(),
    Account.find({}).sort({ code: 1 }).lean(),
    Driver.find({ scenarioId: id }).sort({ createdAt: 1 }).lean(),
    Headcount.find({ scenarioId: id }).sort({ createdAt: 1 }).lean<StaffRow[]>(),
    Payband.find({}).sort({ band: 1, tier: 1 }).lean<PaybandRow[]>(),
    Loan.find({ scenarioId: id }).sort({ loanId: 1 }).lean<LoanRow[]>(),
    CapitalProgram.find({ scenarioId: id })
      .sort({ startPeriodKey: 1, name: 1 })
      .lean(),
    loadEngineInputs(id),
  ]);

  // Pre-serialize programs (and their embedded fee _ids) into plain shapes
  // so any bound server-action args downstream stay plain — React 19 / Next 16
  // refuses to serialize ObjectId/Decimal128 across the action boundary.
  const programRows: ProgramRow[] = (programDocs as unknown as Array<{
    _id: { toString: () => string };
    name: string;
    type: ProgramRow["type"];
    dealSize?: { toString: () => string };
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
  }>).map((p) => ({
    _id: p._id.toString(),
    name: p.name,
    type: p.type,
    dealSize: p.dealSize ? { toString: () => p.dealSize!.toString() } : undefined,
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
  }));

  const horizon = periods.map((p) => p.key);
  const accountByCode = new Map(accounts.map((a) => [a.code, a.name]));
  const nimTier = scenario.nimTier ?? "default";
  const pnl =
    horizon.length > 0
      ? computePnL(
          inputs.drivers,
          inputs.headcount,
          horizon,
          inputs.loans,
          nimTier,
          inputs.programFees,
        )
      : null;

  // Compute full statements only when a tab needs them.
  const needsStatements =
    tab === "balance-sheet" || tab === "cashflow" || tab === "overview";
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
            nimTier,
          },
          inputs.loans,
          inputs.programFees,
        )
      : null;

  const overviewData: OverviewData | null = statements
    ? buildOverviewData(
        buildFYGroups(periods),
        statements.pnl.revenue.lines,
        statements.pnl.opex.lines,
        statements.pnl,
        accountByCode,
      )
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
          groups: buildFYGroups(periods),
          netIncome: serializeSeries(cf.netIncome),
          depreciation: serializeSeries(cf.depreciation),
          changeInAr: serializeSeries(cf.changeInAr),
          changeInAp: serializeSeries(cf.changeInAp),
          capexOutflow: serializeSeries(cf.capexOutflow),
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
        groups: buildFYGroups(periods),
        cash: serializeSeries(statements.bs.cash),
        ar: serializeSeries(statements.bs.ar),
        ppeGross: serializeSeries(statements.bs.ppeGross),
        accumulatedDepreciation: serializeSeries(statements.bs.accumulatedDepreciation),
        ppeNet: serializeSeries(statements.bs.ppeNet),
        totalAssets: serializeSeries(statements.bs.totalAssets),
        ap: serializeSeries(statements.bs.ap),
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
  const groups = buildFYGroups(periods);
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
            Gross profit 5y{" "}
            <span
              className={`font-semibold ${
                pnl && Number(pnl.grossProfitTotal.toFixed(2)) >= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
            >
              {pnl ? fmtMoney2(pnl.grossProfitTotal.toFixed(2)) : "—"}
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
          <LoansTab scenarioId={id} loans={loanDocs} nimTier={nimTier} />
        )}

        {tab === "capital-programs" && (
          <ProgramsTab
            scenarioId={id}
            programs={programRows}
            expenseAccounts={accounts
              .filter((a) => a.type === "revenue")
              .map((a) => ({ code: a.code, name: a.name }))}
            defaultStartPeriod={firstPeriod}
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
              <PnlTable pnl={pnl} groups={groups} accountByCode={accountByCode} />
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
          <div className="flex h-full flex-col bg-white">
            <form
              action={addDriverAction}
              className="flex flex-wrap items-end gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs"
            >
              <FormField label="Driver type">
                <select
                  name="type"
                  defaultValue="opex_fixed"
                  className="w-36 rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="opex_fixed">Fixed $/mo</option>
                  <option value="opex_pct_revenue">% of revenue</option>
                </select>
              </FormField>
              <FormField label="Driver name">
                <input
                  name="name"
                  required
                  className="w-48 rounded-md border border-zinc-300 px-2 py-1"
                />
              </FormField>
              <FormField label="OPEX account">
                <select
                  name="accountCode"
                  required
                  defaultValue=""
                  className="w-56 rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {expenseAccounts.map((a) => (
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
              <FormField label="Base $ / month" hint="for fixed type">
                <input
                  name="baseMonthly"
                  defaultValue="0"
                  inputMode="decimal"
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </FormField>
              <FormField label="Growth % / month" hint="for fixed type">
                <input
                  name="monthlyGrowthPct"
                  defaultValue="0"
                  inputMode="decimal"
                  className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </FormField>
              <FormField label="% of revenue" hint="for % type">
                <input
                  name="pctOfRevenue"
                  defaultValue="0"
                  inputMode="decimal"
                  className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </FormField>
              <button
                type="submit"
                className="ml-auto rounded-md bg-zinc-900 px-4 py-1.5 font-medium text-white hover:bg-zinc-700"
              >
                Add OPEX driver
              </button>
            </form>
            <div className="flex-1 overflow-auto">
              {pnl && pnl.opex.lines.length > 0 ? (
                <PnlTable
                  pnl={pnl}
                  groups={groups}
                  accountByCode={accountByCode}
                  showSection="opex"
                />
              ) : (
                <Stub
                  title="No OPEX drivers yet"
                  message="Add a fixed or %-of-revenue OPEX driver above."
                />
              )}
            </div>
          </div>
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
      </div>

      {/* Bottom tab bar — spreadsheet-style */}
      <TabBar scenarioId={id} active={tab} />
    </div>
  );
}
