import Decimal from "decimal.js";
import { cleanDecimal, fmtMoney2, fmtNum0 } from "@/utils/format";
import {
  clearLoanTape,
  deleteBookGrowthProfile,
  deleteLoan,
  importLoanTape,
  setLoanProgram,
  toggleLoanIncluded,
  updateBookGrowthProfile,
  updateLoan,
} from "../_actions";
import { type BookGrowthProfileInitial, BookGrowthProfileModal } from "./BookGrowthProfileModal";
import { ClearLoansButton } from "./ClearLoansButton";
import { LoanProgramSelect } from "./LoanProgramSelect";
import { type LoanEditInitial, LoanRowActions } from "./LoanRowActions";
import { SeedLoansModal } from "./SeedLoansModal";

export interface BookGrowthProfileRow {
  _id: string;
  capitalProgramId: string;
  fyGrowthPcts: string[];
  avgTenorMonths: number;
  avgSpreadBps: number;
  riskLevel: "low" | "medium" | "high";
}

export type ProgramTypeKey = "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";

export interface LoanRow {
  _id: string;
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  state?: string;
  assetClass?: string;
  propertyStatus?: string;
  location?: string;
  capitalProgramId?: string;
  // Program type of the assigned capital program, used for grouping/tiles.
  programType?: ProgramTypeKey;
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
  synthetic?: boolean;
}

export interface ProgramOption {
  _id: string;
  name: string;
  type: string;
  // YYYY-MM period keys (Australian fiscal calendar applies). Used by the
  // seed-loans modal to derive the FY window each program spans and to
  // distribute seeded loans across those FYs.
  startPeriodKey?: string;
  endPeriodKey?: string;
}

const PROGRAM_TYPE_LABEL: Record<ProgramTypeKey, string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  WAREHOUSE: "Warehouse",
  MIT_FUND: "MIT Fund",
  OTHER: "Other",
};

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime())
    ? "—"
    : `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toIsoDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toLoanEditInitial(l: LoanRow): LoanEditInitial {
  return {
    _id: l._id,
    loanId: l.loanId,
    borrower: l.borrower,
    lenderOfRecord: l.lenderOfRecord,
    capitalProgramId: l.capitalProgramId,
    balance: l.balance.toString(),
    originationDate: toIsoDate(l.originationDate),
    maturityDate: toIsoDate(l.maturityDate),
    termMonths: l.termMonths,
    creditSpreadBps: l.creditSpreadBps,
    internalScore: l.internalScore,
    internalGrade: l.internalGrade,
    lvr: l.lvr ? cleanDecimal(l.lvr.toString()) : undefined,
    dscr: l.dscr ? cleanDecimal(l.dscr.toString()) : undefined,
  };
}

// Loan-level NIM rate = scenario base rate + loan's credit spread (all-in).
function nimBps(l: LoanRow, baseRateBps: number): number {
  return baseRateBps + (l.creditSpreadBps ?? 0);
}

function annualisedNim(l: LoanRow, baseRateBps: number): Decimal {
  return new Decimal(l.balance.toString()).times(nimBps(l, baseRateBps)).div(10000);
}

export function LoansTab({
  scenarioId,
  loans,
  baseRateBps,
  fys,
  growthProfiles,
  programs,
  seedEnabled,
}: {
  scenarioId: string;
  loans: LoanRow[];
  baseRateBps: number;
  fys: number[];
  growthProfiles: BookGrowthProfileRow[];
  programs: ProgramOption[];
  seedEnabled: boolean;
}) {
  const importAction = importLoanTape.bind(null, scenarioId);
  const clearAction = clearLoanTape.bind(null, scenarioId);

  const isIncluded = (l: LoanRow) => l.includeInRevenue !== false;
  const includedCount = loans.filter(isIncluded).length;
  const excludedCount = loans.length - includedCount;

  // Aggregates — only included loans contribute.
  const totalBalance = loans.reduce(
    (acc, l) => (isIncluded(l) ? acc.plus(new Decimal(l.balance.toString())) : acc),
    new Decimal(0),
  );
  const totalAnnualNim = loans.reduce(
    (acc, l) => (isIncluded(l) ? acc.plus(annualisedNim(l, baseRateBps)) : acc),
    new Decimal(0),
  );

  const byChannel = new Map<ProgramTypeKey, { count: number; balance: Decimal; nim: Decimal }>();
  for (const l of loans) {
    if (!isIncluded(l)) continue;
    const key: ProgramTypeKey = l.programType ?? "OTHER";
    const bucket = byChannel.get(key) ?? {
      count: 0,
      balance: new Decimal(0),
      nim: new Decimal(0),
    };
    bucket.count += 1;
    bucket.balance = bucket.balance.plus(new Decimal(l.balance.toString()));
    bucket.nim = bucket.nim.plus(annualisedNim(l, baseRateBps));
    byChannel.set(key, bucket);
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-end gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Loans
          </div>
          <div className="text-base font-semibold text-zinc-900">
            {loans.length}
            {excludedCount > 0 ? (
              <span className="ml-2 text-xs font-normal text-zinc-500">
                <span className="font-semibold text-emerald-700">{includedCount}</span> included ·{" "}
                <span className="font-semibold text-rose-600">{excludedCount}</span> excluded
              </span>
            ) : null}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Total balance
          </div>
          <div className="text-base font-semibold text-zinc-900">
            {fmtMoney2(totalBalance.toFixed(2))}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            NIM $/yr
          </div>
          <div className="text-base font-semibold text-zinc-900">
            {fmtMoney2(totalAnnualNim.toFixed(2))}
            <span className="ml-2 text-xs font-normal text-zinc-500">
              / yr · base {baseRateBps}bps + spread
            </span>
          </div>
        </div>

        <div className="ml-auto self-end">
          <SeedLoansModal
            scenarioId={scenarioId}
            enabled={seedEnabled}
            fys={fys}
            programs={programs}
          />
        </div>

        <form action={importAction} className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Upload .xlsx tape
            </span>
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="block w-64 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-100 file:px-2 file:py-0.5 file:text-xs"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Mode
            </span>
            <select
              name="mode"
              defaultValue="merge"
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
            >
              <option value="merge">Merge (upsert)</option>
              <option value="replace">Replace all</option>
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 font-medium text-white hover:bg-zinc-700"
          >
            Import
          </button>
        </form>

        {loans.length > 0 && (
          <ClearLoansButton loanCount={loans.length} clearAction={clearAction} />
        )}
      </div>

      {/* Book growth profiles — disabled. The AI-driven "Seed loans" modal is
          the supported path for adding loans across years; the synthetic
          generator didn't populate enough fields (borrower / state / asset /
          location) to be useful. Profile data on the scenario is preserved on
          the model so this can be re-enabled later. */}

      {/* Program-type summary */}
      {loans.length > 0 && (
        <div className="grid grid-cols-5 gap-px border-b border-zinc-200 bg-zinc-200">
          {(["CRE_CLO", "CMBS", "WAREHOUSE", "MIT_FUND", "OTHER"] as const).map((ch) => {
            const b = byChannel.get(ch);
            return (
              <div key={ch} className="flex flex-col gap-1 bg-white px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {PROGRAM_TYPE_LABEL[ch]}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold tabular-nums">
                    {fmtNum0(b?.count ?? 0)}
                  </span>
                  <span className="text-xs text-zinc-500">loans</span>
                </div>
                <div className="text-xs tabular-nums text-zinc-700">
                  {fmtMoney2((b?.balance ?? new Decimal(0)).toFixed(2))} balance
                </div>
                <div className="text-xs tabular-nums text-emerald-700">
                  {fmtMoney2((b?.nim ?? new Decimal(0)).toFixed(2))} NIM / yr
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Loan list */}
      <div className="flex-1 overflow-auto">
        {loans.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <div>No loans yet.</div>
            <div className="text-xs">Upload a Gallantree Loan Tape .xlsx to populate the book.</div>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-zinc-100 text-zinc-600">
              <tr>
                <Th className="text-center">Include</Th>
                <Th>Loan ID</Th>
                <Th>Borrower</Th>
                <Th>Lender of Record</Th>
                <Th>Capital program</Th>
                <Th>Asset</Th>
                <Th>State</Th>
                <Th>Status</Th>
                <Th>Origin</Th>
                <Th>Maturity</Th>
                <Th className="text-right">Term (m)</Th>
                <Th className="text-right">Balance</Th>
                <Th className="text-right">LVR</Th>
                <Th className="text-right">DSCR</Th>
                <Th className="text-right">Score</Th>
                <Th>Grade</Th>
                <Th className="text-right">Spread (bps)</Th>
                <Th className="text-right">NIM (bps)</Th>
                <Th className="text-right">NIM $/yr</Th>
                <Th className="text-center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => {
                const included = isIncluded(l);
                const loanNim = nimBps(l, baseRateBps);
                const nimDollars = annualisedNim(l, baseRateBps);
                return (
                  <tr
                    key={l._id}
                    className={`border-b border-zinc-100 hover:bg-yellow-50/40 ${
                      l.synthetic ? "bg-sky-50/40" : ""
                    } ${included ? "" : "bg-zinc-50/60 text-zinc-400"}`}
                  >
                    <Td className="text-center">
                      {l.synthetic ? (
                        <span
                          title="Synthetic loan from growth profile"
                          className="inline-flex h-5 w-9 items-center justify-center rounded-full bg-sky-100 text-[9px] font-semibold uppercase text-sky-700"
                        >
                          syn
                        </span>
                      ) : (
                        <form action={toggleLoanIncluded.bind(null, scenarioId, l._id, !included)}>
                          <button
                            type="submit"
                            aria-pressed={included}
                            aria-label={
                              included
                                ? "Exclude loan from NIM revenue"
                                : "Include loan in NIM revenue"
                            }
                            title={
                              included
                                ? "Click to exclude this loan's NIM from revenue"
                                : "Click to include this loan's NIM in revenue"
                            }
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
                              included ? "bg-emerald-500" : "bg-zinc-300"
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                                included ? "translate-x-4" : "translate-x-0.5"
                              }`}
                            />
                          </button>
                        </form>
                      )}
                    </Td>
                    <Td className="font-mono">{l.loanId}</Td>
                    <Td>{l.borrower ?? "—"}</Td>
                    <Td>{l.lenderOfRecord ?? <span className="text-zinc-300">—</span>}</Td>
                    <Td>
                      <LoanProgramSelect
                        currentProgramId={l.capitalProgramId}
                        programs={programs}
                        saveAction={setLoanProgram.bind(null, scenarioId, l._id)}
                      />
                    </Td>
                    <Td>{l.assetClass ?? "—"}</Td>
                    <Td>{l.state ?? "—"}</Td>
                    <Td>{l.propertyStatus ?? "—"}</Td>
                    <Td className="font-mono text-zinc-600">{fmtDate(l.originationDate)}</Td>
                    <Td className="font-mono text-zinc-600">{fmtDate(l.maturityDate)}</Td>
                    <Td className="text-right tabular-nums">{l.termMonths}</Td>
                    <Td className="text-right tabular-nums">{fmtMoney2(l.balance.toString())}</Td>
                    <Td className="text-right tabular-nums">
                      {l.lvr ? `${(Number(l.lvr.toString()) * 100).toFixed(1)}%` : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {l.dscr ? Number(l.dscr.toString()).toFixed(2) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{l.internalScore ?? "—"}</Td>
                    <Td>{l.internalGrade ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{l.creditSpreadBps ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{loanNim}</Td>
                    <Td className="text-right font-semibold tabular-nums text-emerald-700">
                      {fmtMoney2(nimDollars.toFixed(2))}
                    </Td>
                    <Td className="text-center">
                      {l.synthetic ? (
                        <span className="text-[10px] italic text-zinc-400">—</span>
                      ) : (
                        <LoanRowActions
                          initial={toLoanEditInitial(l)}
                          programs={programs}
                          updateAction={updateLoan.bind(null, scenarioId, l._id)}
                          deleteAction={deleteLoan.bind(null, scenarioId, l._id)}
                        />
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 border-t-2 border-zinc-400 bg-zinc-100 font-semibold">
              <tr>
                <Td colSpan={11}>
                  Totals ({loans.length} loans
                  {excludedCount > 0 ? `, ${includedCount} included` : ""})
                </Td>
                <Td className="text-right tabular-nums">{fmtMoney2(totalBalance.toFixed(2))}</Td>
                <Td colSpan={6}></Td>
                <Td className="text-right tabular-nums text-emerald-700">
                  {fmtMoney2(totalAnnualNim.toFixed(2))}
                </Td>
                <Td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}

const RISK_LABEL: Record<"low" | "medium" | "high", string> = {
  low: "Low risk",
  medium: "Med risk",
  high: "High risk",
};

function _ProfileCard({
  scenarioId,
  fys,
  programs,
  profile,
}: {
  scenarioId: string;
  fys: number[];
  programs: ProgramOption[];
  profile: BookGrowthProfileRow;
}) {
  const program = programs.find((p) => p._id === profile.capitalProgramId);
  const summaryYears = fys
    .map((fy, i) => {
      const pct = Number(cleanDecimal(profile.fyGrowthPcts[i] ?? "0") || "0");
      return pct > 0 ? `FY${String(fy).slice(-2)} ${pct}%` : null;
    })
    .filter(Boolean)
    .join(" · ");
  const initial: BookGrowthProfileInitial = {
    capitalProgramId: profile.capitalProgramId,
    fyGrowthPcts: profile.fyGrowthPcts.map((p) => cleanDecimal(p) || ""),
    avgTenorMonths: profile.avgTenorMonths,
    avgSpreadBps: profile.avgSpreadBps,
    riskLevel: profile.riskLevel,
  };
  return (
    <div className="flex min-w-[220px] flex-col gap-1 rounded-md border border-zinc-200 bg-white px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-zinc-900">
          {program?.name ?? "Unknown program"}
        </span>
        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-600">
          {RISK_LABEL[profile.riskLevel]}
        </span>
      </div>
      <div className="text-[11px] text-zinc-500">
        {profile.avgTenorMonths}mo tenor · {profile.avgSpreadBps}bps spread
      </div>
      <div className="text-[11px] tabular-nums text-zinc-700">
        {summaryYears || <span className="italic text-zinc-400">no growth set</span>}
      </div>
      <div className="mt-1 flex items-center gap-1">
        <BookGrowthProfileModal
          fys={fys}
          programs={programs}
          initial={initial}
          triggerLabel="Edit"
          triggerClassName="rounded px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          saveAction={updateBookGrowthProfile.bind(null, scenarioId, profile._id)}
        />
        <form action={deleteBookGrowthProfile.bind(null, scenarioId, profile._id)}>
          <button
            type="submit"
            className="rounded px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
          >
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-zinc-200 px-3 py-1.5 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-1.5 ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}
