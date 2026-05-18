import Decimal from "decimal.js";
import { cleanDecimal, fmtMoney2, fmtNum0 } from "@/utils/format";
import {
  clearLoanTape,
  deleteLoan,
  importLoanTape,
  setLoanProgram,
  toggleLoanIncluded,
  updateLoan,
  updateLoanBookGrowth,
} from "../_actions";
import { LoanRowActions, type LoanEditInitial } from "./LoanRowActions";
import { LoanProgramSelect } from "./LoanProgramSelect";

export interface LoanRow {
  _id: string;
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  state?: string;
  assetClass?: string;
  propertyStatus?: string;
  location?: string;
  channel: "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";
  capitalProgramId?: string;
  originationDate: Date | string;
  maturityDate: Date | string;
  termMonths: number;
  balance: { toString: () => string };
  lvr?: { toString: () => string };
  dscr?: { toString: () => string };
  internalScore?: number;
  internalGrade?: string;
  creditSpreadBps?: number;
  nimDefaultBps?: number;
  nimNegFloorBps?: number;
  nimHardFloorBps?: number;
  allInPct?: { toString: () => string };
  includeInRevenue?: boolean;
}

export interface ProgramOption {
  _id: string;
  name: string;
  type: string;
}

const CHANNEL_LABEL: Record<LoanRow["channel"], string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  Warehouse: "Warehouse",
  "Non-Conforming": "Non-Conforming",
};

const TIER_LABEL: Record<string, string> = {
  default: "Default",
  neg_floor: "Negative Floor",
  hard_floor: "Hard Floor",
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
    channel: l.channel,
    capitalProgramId: l.capitalProgramId,
    balance: l.balance.toString(),
    originationDate: toIsoDate(l.originationDate),
    maturityDate: toIsoDate(l.maturityDate),
    termMonths: l.termMonths,
    nimDefaultBps: l.nimDefaultBps,
    nimNegFloorBps: l.nimNegFloorBps,
    nimHardFloorBps: l.nimHardFloorBps,
    creditSpreadBps: l.creditSpreadBps,
    internalScore: l.internalScore,
    internalGrade: l.internalGrade,
    lvr: l.lvr ? cleanDecimal(l.lvr.toString()) : undefined,
    dscr: l.dscr ? cleanDecimal(l.dscr.toString()) : undefined,
  };
}

function activeNimBps(
  l: LoanRow,
  tier: "default" | "neg_floor" | "hard_floor",
): number {
  if (tier === "default") return l.nimDefaultBps ?? 0;
  if (tier === "neg_floor") return l.nimNegFloorBps ?? l.nimDefaultBps ?? 0;
  return l.nimHardFloorBps ?? l.nimNegFloorBps ?? l.nimDefaultBps ?? 0;
}

function annualisedNim(l: LoanRow, tier: "default" | "neg_floor" | "hard_floor"): Decimal {
  const bps = activeNimBps(l, tier);
  return new Decimal(l.balance.toString()).times(bps).div(10000);
}

export function LoansTab({
  scenarioId,
  loans,
  nimTier,
  fys,
  bookGrowthPctByYear,
  programs,
}: {
  scenarioId: string;
  loans: LoanRow[];
  nimTier: "default" | "neg_floor" | "hard_floor";
  fys: number[];
  bookGrowthPctByYear: string[];
  programs: ProgramOption[];
}) {
  const importAction = importLoanTape.bind(null, scenarioId);
  const growthAction = updateLoanBookGrowth.bind(null, scenarioId);

  // Compute the cumulative book size at end of year N as % of today, for the
  // tiny preview shown next to the inputs.
  const growthRates = fys.map((_, i) =>
    Number(cleanDecimal(bookGrowthPctByYear[i]) || "0"),
  );
  const cumulativeMultiplier = growthRates.reduce(
    (acc, r) => acc * (1 + r / 100),
    1,
  );
  const anyNonZero = growthRates.some((r) => r !== 0);
  const clearAction = clearLoanTape.bind(null, scenarioId);

  const isIncluded = (l: LoanRow) => l.includeInRevenue !== false;
  const includedCount = loans.filter(isIncluded).length;
  const excludedCount = loans.length - includedCount;

  // Aggregates — only included loans contribute to balance + NIM totals.
  const totalBalance = loans.reduce(
    (acc, l) => (isIncluded(l) ? acc.plus(new Decimal(l.balance.toString())) : acc),
    new Decimal(0),
  );
  const totalAnnualNim = loans.reduce(
    (acc, l) => (isIncluded(l) ? acc.plus(annualisedNim(l, nimTier)) : acc),
    new Decimal(0),
  );

  const byChannel = new Map<
    LoanRow["channel"],
    { count: number; balance: Decimal; nim: Decimal }
  >();
  for (const l of loans) {
    if (!isIncluded(l)) continue;
    const bucket = byChannel.get(l.channel) ?? {
      count: 0,
      balance: new Decimal(0),
      nim: new Decimal(0),
    };
    bucket.count += 1;
    bucket.balance = bucket.balance.plus(new Decimal(l.balance.toString()));
    bucket.nim = bucket.nim.plus(annualisedNim(l, nimTier));
    byChannel.set(l.channel, bucket);
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
                <span className="font-semibold text-emerald-700">{includedCount}</span> included
                · <span className="font-semibold text-rose-600">{excludedCount}</span> excluded
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
            NIM tier · {TIER_LABEL[nimTier]}
          </div>
          <div className="text-base font-semibold text-zinc-900">
            {fmtMoney2(totalAnnualNim.toFixed(2))}
            <span className="ml-2 text-xs font-normal text-zinc-500">/ yr at t=0</span>
          </div>
        </div>

        <form action={growthAction} className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Book growth % per FY
              <span className="ml-1 font-normal lowercase text-zinc-400">
                · compounded forward
              </span>
            </span>
            <div className="flex items-center gap-2">
              {fys.map((fy, i) => (
                <label key={fy} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-mono text-zinc-500">
                    FY{String(fy).slice(-2)}
                  </span>
                  <input
                    name={`loanBookGrowthPctY${i}`}
                    defaultValue={cleanDecimal(bookGrowthPctByYear[i]) || ""}
                    inputMode="decimal"
                    placeholder="0"
                    className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right text-xs tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Save
          </button>
          {anyNonZero ? (
            <span
              className={`self-center text-[11px] ${
                cumulativeMultiplier > 1
                  ? "text-emerald-700"
                  : cumulativeMultiplier < 1
                    ? "text-rose-700"
                    : "text-zinc-500"
              }`}
            >
              End-of-FY{String(fys[fys.length - 1] ?? 0).slice(-2)} book ≈{" "}
              <span className="font-semibold">
                {(cumulativeMultiplier * 100).toFixed(0)}%
              </span>{" "}
              of today
            </span>
          ) : null}
        </form>

        <form action={importAction} className="ml-auto flex items-end gap-2">
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
          <form action={clearAction}>
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-zinc-600 hover:bg-rose-50 hover:text-rose-700"
            >
              Clear all
            </button>
          </form>
        )}
      </div>

      {/* Channel summary */}
      {loans.length > 0 && (
        <div className="grid grid-cols-4 gap-px border-b border-zinc-200 bg-zinc-200">
          {(["CRE_CLO", "CMBS", "Warehouse", "Non-Conforming"] as const).map((ch) => {
            const b = byChannel.get(ch);
            return (
              <div key={ch} className="flex flex-col gap-1 bg-white px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {CHANNEL_LABEL[ch]}
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
                <Th className="text-right">NIM ({TIER_LABEL[nimTier]}) bps</Th>
                <Th className="text-right">NIM $/yr</Th>
                <Th className="text-center">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => {
                const included = isIncluded(l);
                const nimBps = activeNimBps(l, nimTier);
                const nimDollars = annualisedNim(l, nimTier);
                return (
                  <tr
                    key={l._id}
                    className={`border-b border-zinc-100 hover:bg-yellow-50/40 ${
                      included ? "" : "bg-zinc-50/60 text-zinc-400"
                    }`}
                  >
                    <Td className="text-center">
                      <form
                        action={toggleLoanIncluded.bind(null, scenarioId, l._id, !included)}
                      >
                        <button
                          type="submit"
                          aria-pressed={included}
                          aria-label={
                            included ? "Exclude loan from NIM revenue" : "Include loan in NIM revenue"
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
                    </Td>
                    <Td className="font-mono">{l.loanId}</Td>
                    <Td>{l.borrower ?? "—"}</Td>
                    <Td>{l.lenderOfRecord ?? <span className="text-zinc-300">—</span>}</Td>
                    <Td>
                      <LoanProgramSelect
                        currentProgramId={l.capitalProgramId}
                        channelLabel={CHANNEL_LABEL[l.channel]}
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
                    <Td className="text-right tabular-nums">
                      {fmtMoney2(l.balance.toString())}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {l.lvr ? `${(Number(l.lvr.toString()) * 100).toFixed(1)}%` : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">
                      {l.dscr ? Number(l.dscr.toString()).toFixed(2) : "—"}
                    </Td>
                    <Td className="text-right tabular-nums">{l.internalScore ?? "—"}</Td>
                    <Td>{l.internalGrade ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{l.creditSpreadBps ?? "—"}</Td>
                    <Td className="text-right tabular-nums">{nimBps}</Td>
                    <Td className="text-right font-semibold tabular-nums text-emerald-700">
                      {fmtMoney2(nimDollars.toFixed(2))}
                    </Td>
                    <Td className="text-center">
                      <LoanRowActions
                        initial={toLoanEditInitial(l)}
                        programs={programs}
                        updateAction={updateLoan.bind(null, scenarioId, l._id)}
                        deleteAction={deleteLoan.bind(null, scenarioId, l._id)}
                      />
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

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`border-b border-zinc-200 px-3 py-1.5 text-left font-medium ${className}`}
    >
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
