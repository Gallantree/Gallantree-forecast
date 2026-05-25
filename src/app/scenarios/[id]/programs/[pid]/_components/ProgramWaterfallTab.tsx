import { fmtMoney2 } from "@/utils/format";
import type { ProgramAggregate, ProgramFeeRow, ProgramRow } from "../../../_components/ProgramsTab";

function annualFeeAmount(f: ProgramFeeRow): number {
  return (Number(f.basisAmount.toString()) * f.feeBps) / 10000;
}

function trancheAnnualInterest(
  l: { numNotes?: number; returnProfileBps: number; rateType: "fixed" | "variable" },
  faceValuePerNote: number,
  baseRateBps: number,
): number {
  const principal = (l.numNotes ?? 0) * faceValuePerNote;
  const rateBps = l.rateType === "variable" ? baseRateBps + l.returnProfileBps : l.returnProfileBps;
  return (principal * rateBps) / 10000;
}

export async function ProgramWaterfallTab({
  program,
  aggregate,
  baseRateBps,
}: {
  program: ProgramRow;
  aggregate: ProgramAggregate;
  baseRateBps: number;
}) {
  if (aggregate.totalBalance === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <div>No loans assigned to this program yet.</div>
        <div className="text-xs">Assign loans from the Loan Book tab on the scenario page.</div>
      </div>
    );
  }

  const faceValuePerNote = Number(program.faceValuePerNote?.toString() ?? "0");
  const waSpreadBps =
    aggregate.weightBalanceForSpread > 0
      ? aggregate.weightSumSpreadBps / aggregate.weightBalanceForSpread
      : 0;

  const grossCollections = (aggregate.totalBalance * waSpreadBps) / 10000;

  type WaterfallItem = {
    priority: number;
    item: string;
    annual: number;
    color: string;
  };

  const items: WaterfallItem[] = [];
  let priority = 1;

  const seniorMgmt = program.fees.filter((f) => f.category === "senior_mgmt");
  const subordinateMgmt = program.fees.filter((f) => f.category === "subordinate_mgmt");
  const servicing = program.fees.filter((f) => f.category === "servicing");

  for (const f of seniorMgmt) {
    items.push({
      priority: priority++,
      item: f.name,
      annual: annualFeeAmount(f),
      color: "text-amber-700",
    });
  }
  for (const f of subordinateMgmt) {
    items.push({
      priority: priority++,
      item: f.name,
      annual: annualFeeAmount(f),
      color: "text-amber-700",
    });
  }
  for (const f of servicing) {
    items.push({
      priority: priority++,
      item: f.name,
      annual: annualFeeAmount(f),
      color: "text-amber-700",
    });
  }

  const liabilities = program.liabilities ?? [];
  for (const l of liabilities) {
    const annual = trancheAnnualInterest(l, faceValuePerNote, baseRateBps);
    if (annual > 0) {
      items.push({
        priority: priority++,
        item: `Note interest — ${l.name}`,
        annual,
        color: "text-rose-700",
      });
    }
  }

  const totalOutflows = items.reduce((acc, i) => acc + i.annual, 0);
  const residual = grossCollections - totalOutflows;

  let running = grossCollections;

  return (
    <div className="flex flex-col">
      <div className="overflow-auto p-4">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-50">
              <Th className="w-12">Priority</Th>
              <Th>Item</Th>
              <Th className="text-right">Annual $</Th>
              <Th className="text-right">Running balance</Th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-zinc-100 bg-emerald-50">
              <Td className="text-zinc-400">—</Td>
              <Td className="font-semibold text-emerald-800">
                Gross interest income (loan book)
                <span className="ml-2 font-normal text-zinc-500">
                  {fmtMoney2(aggregate.totalBalance)} × {Math.round(waSpreadBps)} bps
                </span>
              </Td>
              <Td className="text-right font-semibold tabular-nums text-emerald-700">
                {fmtMoney2(grossCollections)}
              </Td>
              <Td className="text-right tabular-nums text-zinc-600">—</Td>
            </tr>
            {items.map((item) => {
              running -= item.annual;
              const runningSnapshot = running;
              return (
                <tr key={item.item} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                  <Td className="tabular-nums text-zinc-400">{item.priority}</Td>
                  <Td className={`font-medium ${item.color}`}>{item.item}</Td>
                  <Td className={`text-right tabular-nums ${item.color}`}>
                    ({fmtMoney2(item.annual)})
                  </Td>
                  <Td
                    className={`text-right tabular-nums font-semibold ${
                      runningSnapshot >= 0 ? "text-zinc-700" : "text-rose-700"
                    }`}
                  >
                    {fmtMoney2(runningSnapshot)}
                  </Td>
                </tr>
              );
            })}
            <tr className="border-t-2 border-zinc-300 bg-indigo-50">
              <Td className="text-zinc-400">—</Td>
              <Td className="font-semibold text-indigo-800">Residual / equity return</Td>
              <Td
                className={`text-right font-semibold tabular-nums ${
                  residual >= 0 ? "text-indigo-700" : "text-rose-700"
                }`}
              >
                {fmtMoney2(residual)}
              </Td>
              <Td className="text-right tabular-nums text-zinc-400">—</Td>
            </tr>
          </tbody>
        </table>
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

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
