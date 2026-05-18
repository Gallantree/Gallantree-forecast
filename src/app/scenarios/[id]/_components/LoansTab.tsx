import Decimal from "decimal.js";
import { fmtMoney2, fmtNum0 } from "@/utils/format";
import { clearLoanTape, importLoanTape } from "../_actions";

export interface LoanRow {
  _id: string;
  loanId: string;
  borrower?: string;
  state?: string;
  assetClass?: string;
  propertyStatus?: string;
  location?: string;
  channel: "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";
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
}: {
  scenarioId: string;
  loans: LoanRow[];
  nimTier: "default" | "neg_floor" | "hard_floor";
}) {
  const importAction = importLoanTape.bind(null, scenarioId);
  const clearAction = clearLoanTape.bind(null, scenarioId);

  // Aggregates
  const totalBalance = loans.reduce(
    (acc, l) => acc.plus(new Decimal(l.balance.toString())),
    new Decimal(0),
  );
  const totalAnnualNim = loans.reduce(
    (acc, l) => acc.plus(annualisedNim(l, nimTier)),
    new Decimal(0),
  );

  const byChannel = new Map<
    LoanRow["channel"],
    { count: number; balance: Decimal; nim: Decimal }
  >();
  for (const l of loans) {
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
          <div className="text-base font-semibold text-zinc-900">{loans.length}</div>
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
            <span className="ml-2 text-xs font-normal text-zinc-500">/ yr (annualised)</span>
          </div>
        </div>

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
                <Th>Loan ID</Th>
                <Th>Borrower</Th>
                <Th>Channel</Th>
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
              </tr>
            </thead>
            <tbody>
              {loans.map((l) => {
                const nimBps = activeNimBps(l, nimTier);
                const nimDollars = annualisedNim(l, nimTier);
                return (
                  <tr key={l._id} className="border-b border-zinc-100 hover:bg-yellow-50/40">
                    <Td className="font-mono">{l.loanId}</Td>
                    <Td>{l.borrower ?? "—"}</Td>
                    <Td>{CHANNEL_LABEL[l.channel]}</Td>
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
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 border-t-2 border-zinc-400 bg-zinc-100 font-semibold">
              <tr>
                <Td colSpan={9}>Totals ({loans.length} loans)</Td>
                <Td className="text-right tabular-nums">{fmtMoney2(totalBalance.toFixed(2))}</Td>
                <Td colSpan={6}></Td>
                <Td className="text-right tabular-nums text-emerald-700">
                  {fmtMoney2(totalAnnualNim.toFixed(2))}
                </Td>
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
