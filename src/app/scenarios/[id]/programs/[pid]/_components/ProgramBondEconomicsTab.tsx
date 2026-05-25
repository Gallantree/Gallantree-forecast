import { fmtMoney2, fmtNum0 } from "@/utils/format";
import { isFundingTranche, type ProgramAggregate, type ProgramLiabilityRow, type ProgramRow } from "../../../_components/ProgramsTab";

const TYPE_LABEL: Record<ProgramRow["type"], string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  MIT_FUND: "MIT Fund",
  WAREHOUSE: "Warehouse",
  OTHER: "Other",
};

function tranchePrincipal(l: ProgramLiabilityRow, faceValuePerNote: number): number {
  return (l.numNotes ?? 0) * faceValuePerNote;
}

function trancheRateBps(l: ProgramLiabilityRow, baseRateBps: number): number {
  return l.rateType === "variable" ? baseRateBps + l.returnProfileBps : l.returnProfileBps;
}

export async function ProgramBondEconomicsTab({
  program,
  aggregate,
  baseRateBps,
}: {
  program: ProgramRow;
  aggregate: ProgramAggregate;
  baseRateBps: number;
}) {
  const faceValuePerNote = Number(program.faceValuePerNote?.toString() ?? "0");
  const dealSize = program.dealSize ? Number(program.dealSize.toString()) : 0;
  const noteCount = faceValuePerNote > 0 ? Math.round(dealSize / faceValuePerNote) : null;

  const liabilities = program.liabilities ?? [];

  const totalFundedPrincipal = liabilities.reduce(
    (acc, l) => acc + tranchePrincipal(l, faceValuePerNote),
    0,
  );
  const totalAnnualInterest = liabilities.reduce(
    (acc, l) =>
      acc + (tranchePrincipal(l, faceValuePerNote) * trancheRateBps(l, baseRateBps)) / 10000,
    0,
  );

  let liabWasNum = 0;
  let liabWasDen = 0;
  for (const l of liabilities) {
    if (!isFundingTranche(l.name, l.returnProfileBps)) continue;
    const principal = tranchePrincipal(l, faceValuePerNote);
    if (principal <= 0) continue;
    liabWasNum += principal * l.returnProfileBps;
    liabWasDen += principal;
  }
  const liabWasBps = liabWasDen > 0 ? Math.round(liabWasNum / liabWasDen) : 0;

  const assetWasBps =
    aggregate.weightBalanceForSpread > 0
      ? Math.round(aggregate.weightSumSpreadBps / aggregate.weightBalanceForSpread)
      : 0;

  const annualInterestIncome = (aggregate.totalBalance * assetWasBps) / 10000;
  const nimBps = assetWasBps - liabWasBps;
  const nimAnnual = (aggregate.totalBalance * nimBps) / 10000;

  return (
    <div className="flex flex-col gap-6 p-6">
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Deal summary
        </h3>
        <div className="grid grid-cols-2 gap-px rounded-md border border-zinc-200 bg-zinc-200 overflow-hidden sm:grid-cols-3 lg:grid-cols-6">
          <SummaryTile label="Deal size" value={dealSize > 0 ? fmtMoney2(dealSize) : "—"} />
          <SummaryTile
            label="Note count"
            value={noteCount !== null ? fmtNum0(noteCount) : "—"}
          />
          <SummaryTile
            label="Face value / note"
            value={faceValuePerNote > 0 ? fmtMoney2(faceValuePerNote) : "—"}
          />
          <SummaryTile label="Type" value={TYPE_LABEL[program.type]} />
          <SummaryTile label="Start period" value={program.startPeriodKey} />
          <SummaryTile label="End period" value={program.endPeriodKey ?? "—"} />
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          NIM economics
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Asset side
            </div>
            <EconRow label="Total loan balance" value={fmtMoney2(aggregate.totalBalance)} />
            <EconRow
              label="Assets WAS"
              value={assetWasBps > 0 ? `${assetWasBps} bps` : "—"}
            />
            <EconRow
              label="Annual interest income"
              value={fmtMoney2(annualInterestIncome)}
              tone="ok"
            />
          </div>
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Liability side
            </div>
            <EconRow
              label="Total funded principal"
              value={totalFundedPrincipal > 0 ? fmtMoney2(totalFundedPrincipal) : "—"}
            />
            <EconRow
              label="Liabilities WAS"
              value={liabWasBps > 0 ? `${liabWasBps} bps` : "—"}
            />
            <EconRow
              label="Annual interest expense"
              value={totalAnnualInterest > 0 ? fmtMoney2(totalAnnualInterest) : "—"}
              tone="warn"
            />
          </div>
          <div className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Net interest margin
            </div>
            <EconRow
              label="NIM spread"
              value={`${nimBps} bps`}
              tone={nimBps > 0 ? "ok" : "warn"}
            />
            <EconRow
              label="NIM $/yr"
              value={fmtMoney2(nimAnnual)}
              tone={nimAnnual > 0 ? "ok" : "warn"}
            />
          </div>
        </div>
      </section>

      {liabilities.length > 0 ? (
        <section>
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Tranche economics
          </h3>
          <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-zinc-50 text-zinc-500">
                <tr>
                  <Th>Tranche</Th>
                  <Th className="text-right"># notes</Th>
                  <Th className="text-right">Principal ($)</Th>
                  <Th className="text-right">Spread (bps)</Th>
                  <Th>Rate type</Th>
                  <Th className="text-right">All-in (bps)</Th>
                  <Th className="text-right">All-in (%)</Th>
                  <Th className="text-right">Annual interest</Th>
                  <Th className="text-right">% of total interest</Th>
                  <Th className="text-right">% of total principal</Th>
                </tr>
              </thead>
              <tbody>
                {liabilities.map((l) => {
                  const principal = tranchePrincipal(l, faceValuePerNote);
                  const rateBps = trancheRateBps(l, baseRateBps);
                  const annual = (principal * rateBps) / 10000;
                  const pctInterest =
                    totalAnnualInterest > 0 ? (annual / totalAnnualInterest) * 100 : null;
                  const pctPrincipal =
                    totalFundedPrincipal > 0 ? (principal / totalFundedPrincipal) * 100 : null;
                  return (
                    <tr key={l._id} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                      <Td className="font-medium">{l.name}</Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {l.numNotes !== undefined ? fmtNum0(l.numNotes) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums font-semibold text-zinc-900">
                        {principal > 0 ? fmtMoney2(principal) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {l.returnProfileBps}
                      </Td>
                      <Td>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                            l.rateType === "fixed"
                              ? "bg-zinc-100 text-zinc-700"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {l.rateType === "fixed" ? "Fixed" : "Variable"}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {rateBps > 0 ? rateBps : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {rateBps > 0 ? `${(rateBps / 100).toFixed(2)}%` : "—"}
                      </Td>
                      <Td className="text-right tabular-nums font-semibold text-rose-700">
                        {annual > 0 ? fmtMoney2(annual) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {pctInterest !== null ? `${pctInterest.toFixed(1)}%` : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {pctPrincipal !== null ? `${pctPrincipal.toFixed(1)}%` : "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
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

function EconRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex items-baseline justify-between gap-2 py-1">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${valueClass}`}>{value}</span>
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
