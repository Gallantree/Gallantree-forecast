import { fmtMoney2, fmtNum0 } from "@/utils/format";
import { updateLiabilityTranche } from "../../../_actions";
import {
  isFundingTranche,
  type ProgramLiabilityRow,
  type ProgramRow,
} from "../../../_components/ProgramsTab";
import { LiabilityRowActions } from "./LiabilityRowActions";

function tranchePrincipal(l: ProgramLiabilityRow, faceValuePerNote: number): number {
  return (l.numNotes ?? 0) * faceValuePerNote;
}

function trancheRateBps(l: ProgramLiabilityRow, baseRateBps: number): number {
  return l.rateType === "variable" ? baseRateBps + l.returnProfileBps : l.returnProfileBps;
}

export async function ProgramLiabilitiesTab({
  program,
  baseRateBps,
  scenarioId,
  programId,
}: {
  program: ProgramRow;
  baseRateBps: number;
  scenarioId: string;
  programId: string;
}) {
  const liabilities = program.liabilities ?? [];
  const faceValuePerNote = Number(program.faceValuePerNote?.toString() ?? "0");

  if (liabilities.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <div>No liability tranches configured for this program.</div>
        <div className="text-xs">Add liabilities via the Overview tab Edit button.</div>
      </div>
    );
  }

  const totalPrincipal = liabilities.reduce(
    (acc, l) => acc + tranchePrincipal(l, faceValuePerNote),
    0,
  );
  const totalNotes = liabilities.reduce((acc, l) => acc + (l.numNotes ?? 0), 0);
  const totalAnnualInterest = liabilities.reduce(
    (acc, l) =>
      acc + (tranchePrincipal(l, faceValuePerNote) * trancheRateBps(l, baseRateBps)) / 10000,
    0,
  );

  let wasNum = 0;
  let wasDen = 0;
  for (const l of liabilities) {
    if (!isFundingTranche(l.name, l.returnProfileBps)) continue;
    const principal = tranchePrincipal(l, faceValuePerNote);
    if (principal <= 0) continue;
    wasNum += principal * l.returnProfileBps;
    wasDen += principal;
  }
  const liabWasBps = wasDen > 0 ? Math.round(wasNum / wasDen) : null;

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <SummaryTile label="Tranches" value={fmtNum0(liabilities.length)} />
        <SummaryTile label="Total notes" value={fmtNum0(totalNotes)} />
        <SummaryTile
          label="Total principal"
          value={faceValuePerNote > 0 ? fmtMoney2(totalPrincipal) : "—"}
        />
        <SummaryTile
          label="Debt WAS"
          value={liabWasBps !== null ? `${liabWasBps} bps` : "—"}
          sub="funding tranches"
        />
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-2">
        <SummaryTile label="Annual interest" value={fmtMoney2(totalAnnualInterest)} tone="warn" />
        <SummaryTile
          label="Monthly interest"
          value={fmtMoney2(totalAnnualInterest / 12)}
          tone="warn"
        />
      </div>

      <div className="overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <Th>Tranche</Th>
              <Th className="text-right"># notes</Th>
              <Th className="text-right">Face value / note</Th>
              <Th className="text-right">Principal ($)</Th>
              <Th className="text-right">Spread (bps)</Th>
              <Th>Rate type</Th>
              <Th className="text-right">All-in rate</Th>
              <Th className="text-right">Annual interest</Th>
              <Th className="text-right">Monthly interest</Th>
              <Th className="text-right">% of structure</Th>
              <Th>Account</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {liabilities.map((l) => {
              const principal = tranchePrincipal(l, faceValuePerNote);
              const rateBps = trancheRateBps(l, baseRateBps);
              const annual = (principal * rateBps) / 10000;
              const monthly = annual / 12;
              const pctOfStructure = totalPrincipal > 0 ? (principal / totalPrincipal) * 100 : null;
              return (
                <tr key={l._id} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                  <Td className="font-medium">{l.name}</Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {l.numNotes !== undefined ? fmtNum0(l.numNotes) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {faceValuePerNote > 0 ? fmtMoney2(faceValuePerNote) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-zinc-900">
                    {principal > 0 ? fmtMoney2(principal) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">{l.returnProfileBps}</Td>
                  <Td>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                        l.rateType === "fixed"
                          ? "bg-zinc-100 text-zinc-700"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {l.rateType === "fixed" ? "Fixed" : "Variable + base"}
                    </span>
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {rateBps > 0 ? `${rateBps} bps (${(rateBps / 100).toFixed(2)}%)` : "—"}
                  </Td>
                  <Td className="text-right tabular-nums font-semibold text-rose-700">
                    {annual > 0 ? fmtMoney2(annual) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {monthly > 0 ? fmtMoney2(monthly) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {pctOfStructure !== null ? `${pctOfStructure.toFixed(1)}%` : "—"}
                  </Td>
                  <Td className="font-mono text-[11px] text-zinc-500">{l.accountCode ?? "—"}</Td>
                  <Td className="text-center">
                    <LiabilityRowActions
                      initial={{
                        _id: l._id,
                        name: l.name,
                        numNotes: l.numNotes,
                        returnProfileBps: l.returnProfileBps,
                        calculationMethod: l.calculationMethod,
                        rateType: l.rateType,
                        accountCode: l.accountCode,
                      }}
                      updateAction={updateLiabilityTranche.bind(null, scenarioId, programId, l._id)}
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

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-0.5 bg-white px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {sub ? <span className="ml-1 font-normal lowercase text-zinc-400">· {sub}</span> : null}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
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
