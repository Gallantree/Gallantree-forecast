import { cleanDecimal, fmtMoney2, fmtNum0 } from "@/utils/format";
import { deleteLoan, updateLoan } from "../../../_actions";
import { type LoanEditInitial, LoanRowActions } from "../../../_components/LoanRowActions";
import type { LoanRow } from "../../../_components/LoansTab";
import type { ProgramAggregate, ProgramRow } from "../../../_components/ProgramsTab";

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

const ARREARS_LABEL: Record<NonNullable<LoanRow["arrearsStatus"]>, string> = {
  current: "Current",
  arrears30: "30d",
  arrears60: "60d",
  arrears90: "90d",
  default: "Default",
};

const ARREARS_COLOR: Record<NonNullable<LoanRow["arrearsStatus"]>, string> = {
  current: "bg-emerald-100 text-emerald-800",
  arrears30: "bg-amber-100 text-amber-800",
  arrears60: "bg-orange-100 text-orange-800",
  arrears90: "bg-rose-100 text-rose-800",
  default: "bg-rose-200 text-rose-900",
};

export async function ProgramLoanBookTab({
  loans,
  aggregate,
  scenarioId,
  programs,
}: {
  loans: LoanRow[];
  program: ProgramRow;
  aggregate: ProgramAggregate;
  scenarioId: string;
  programs: { _id: string; name: string; type: string }[];
}) {
  const waScore =
    aggregate.weightBalanceForScore > 0
      ? aggregate.weightSumScore / aggregate.weightBalanceForScore
      : null;
  const waLvr =
    aggregate.weightBalanceForLvr > 0
      ? aggregate.weightSumLvr / aggregate.weightBalanceForLvr
      : null;
  const waDscr =
    aggregate.weightBalanceForDscr > 0
      ? aggregate.weightSumDscr / aggregate.weightBalanceForDscr
      : null;
  const waSpreadBps =
    aggregate.weightBalanceForSpread > 0
      ? aggregate.weightSumSpreadBps / aggregate.weightBalanceForSpread
      : null;

  if (loans.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <div>No loans assigned to this program yet.</div>
        <div className="text-xs">Assign loans from the Loan Book tab on the scenario page.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-6">
        <SummaryTile label="Loans" value={fmtNum0(aggregate.loanCount)} />
        <SummaryTile label="Total balance" value={fmtMoney2(aggregate.totalBalance)} />
        <SummaryTile label="WA score" value={waScore !== null ? waScore.toFixed(1) : "—"} />
        <SummaryTile label="WA LVR" value={waLvr !== null ? `${(waLvr * 100).toFixed(1)}%` : "—"} />
        <SummaryTile label="WA DSCR" value={waDscr !== null ? `${waDscr.toFixed(2)}x` : "—"} />
        <SummaryTile
          label="WA spread"
          value={waSpreadBps !== null ? `${Math.round(waSpreadBps)} bps` : "—"}
        />
      </div>

      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <Th>Loan ID</Th>
              <Th>Borrower</Th>
              <Th>State</Th>
              <Th>Asset Class</Th>
              <Th className="text-right">Balance</Th>
              <Th className="text-right">LVR</Th>
              <Th className="text-right">DSCR</Th>
              <Th className="text-right">Score</Th>
              <Th>Grade</Th>
              <Th className="text-right">Spread (bps)</Th>
              <Th className="text-right">All-in rate</Th>
              <Th>Status</Th>
              <Th className="text-right">Term (mo)</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {loans.map((l) => {
              const bal = Number(l.balance.toString());
              const lvr = l.lvr ? Number(l.lvr.toString()) : null;
              const dscr = l.dscr ? Number(l.dscr.toString()) : null;
              const allIn = l.allInPct ? Number(l.allInPct.toString()) : null;
              const status = l.arrearsStatus ?? "current";
              return (
                <tr key={l._id} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                  <Td className="font-mono font-medium">{l.loanId}</Td>
                  <Td className="text-zinc-700">{l.borrower ?? "—"}</Td>
                  <Td className="text-zinc-600">{l.state ?? "—"}</Td>
                  <Td className="text-zinc-600">{l.assetClass ?? "—"}</Td>
                  <Td className="text-right tabular-nums font-semibold text-zinc-900">
                    {fmtMoney2(bal)}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {lvr !== null ? `${(lvr * 100).toFixed(1)}%` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {dscr !== null ? `${dscr.toFixed(2)}x` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {l.internalScore !== undefined ? l.internalScore : "—"}
                  </Td>
                  <Td className="text-zinc-600">{l.internalGrade ?? "—"}</Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {l.creditSpreadBps !== undefined ? l.creditSpreadBps : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {allIn !== null ? `${allIn.toFixed(2)}%` : "—"}
                  </Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ARREARS_COLOR[status]}`}
                    >
                      {ARREARS_LABEL[status]}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">{l.termMonths}</Td>
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
        </table>
      </div>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-white px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-zinc-900">{value}</span>
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

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
