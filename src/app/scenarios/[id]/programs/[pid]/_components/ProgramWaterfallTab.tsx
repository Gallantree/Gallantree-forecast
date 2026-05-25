import {
  annualFeeAmount,
  equityReturnPct,
  grossCollectionsAllIn,
  trancheAnnualInterest,
} from "@/engine/waterfall";
import { fmtMoney2, fmtNum2 } from "@/utils/format";
import {
  isFundingTranche,
  type ProgramAggregate,
  type ProgramRow,
} from "../../../_components/ProgramsTab";

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

  // Gross collections use the all-in rate (base + credit spread) to match how
  // variable-rate note interest is calculated. Using only the credit spread
  // understates income and makes equity always appear deeply negative.
  const waAllInBps = waSpreadBps + baseRateBps;
  const grossCollections = grossCollectionsAllIn(aggregate.totalBalance, waSpreadBps, baseRateBps);

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
  const trustee = program.fees.filter((f) => f.category === "trustee");
  const other = program.fees.filter((f) => f.category === "other");

  for (const f of [...seniorMgmt, ...subordinateMgmt, ...servicing, ...trustee, ...other]) {
    items.push({
      priority: priority++,
      item: f.name,
      annual: annualFeeAmount(Number(f.basisAmount?.toString() ?? "0"), f.feeBps ?? 0),
      color: "text-amber-700",
    });
  }

  const liabilities = program.liabilities ?? [];
  // Split into debt tranches (funding) and equity tranches (residual claimants).
  const debtTranches = liabilities.filter((l) => isFundingTranche(l.name, l.returnProfileBps));
  const equityTranches = liabilities.filter((l) => !isFundingTranche(l.name, l.returnProfileBps));

  for (const l of debtTranches) {
    const annual = trancheAnnualInterest(
      l.numNotes ?? 0,
      faceValuePerNote,
      l.returnProfileBps,
      l.rateType,
      baseRateBps,
    );
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

  // Equity return profile: residual is distributed pro-rata across equity tranches.
  const totalEquityPrincipal = equityTranches.reduce(
    (acc, l) => acc + (l.numNotes ?? 0) * faceValuePerNote,
    0,
  );
  const equityYieldPct = equityReturnPct(residual, totalEquityPrincipal);

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
                  {fmtMoney2(aggregate.totalBalance)} × {Math.round(waAllInBps)} bps
                  <span className="ml-1 text-zinc-400">
                    ({Math.round(waSpreadBps)} credit + {baseRateBps} base)
                  </span>
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

            {/* Equity tranche rows — each absorbs residual pro-rata by principal */}
            {equityTranches.length > 0 ? (
              equityTranches.map((l) => {
                const principal = (l.numNotes ?? 0) * faceValuePerNote;
                const share = totalEquityPrincipal > 0 ? principal / totalEquityPrincipal : 0;
                const trancheResidual = residual * share;
                const trancheYield = principal > 0 ? (trancheResidual / principal) * 100 : null;
                return (
                  <tr key={l._id} className="border-t-2 border-zinc-300 bg-indigo-50">
                    <Td className="text-zinc-400">—</Td>
                    <Td className="font-semibold text-indigo-800">
                      {l.name} tranche
                      {principal > 0 && (
                        <span className="ml-2 font-normal text-zinc-500">
                          {(l.numNotes ?? 0).toLocaleString()} notes × {fmtMoney2(faceValuePerNote)}
                          {" · "}
                          principal {fmtMoney2(principal)}
                        </span>
                      )}
                    </Td>
                    <Td
                      className={`text-right font-semibold tabular-nums ${
                        trancheResidual >= 0 ? "text-indigo-700" : "text-rose-700"
                      }`}
                    >
                      {fmtMoney2(trancheResidual)}
                    </Td>
                    <Td
                      className={`text-right tabular-nums font-semibold ${
                        trancheYield !== null && trancheYield >= 0
                          ? "text-indigo-700"
                          : "text-rose-700"
                      }`}
                    >
                      {trancheYield !== null ? `${fmtNum2(trancheYield)}% p.a.` : "—"}
                    </Td>
                  </tr>
                );
              })
            ) : (
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
            )}
          </tbody>
        </table>
      </div>

      {/* Equity return profile summary card */}
      {equityTranches.length > 0 && (
        <div className="border-t border-zinc-200 bg-indigo-50/60 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-indigo-600">
            Equity return profile
          </p>
          <div className="flex flex-wrap gap-6 text-xs">
            <Metric
              label="Total equity principal"
              value={fmtMoney2(totalEquityPrincipal)}
              tone={totalEquityPrincipal > 0 ? "neutral" : "warn"}
            />
            <Metric
              label="Annual residual cashflow"
              value={fmtMoney2(residual)}
              tone={residual >= 0 ? "ok" : "warn"}
            />
            <Metric
              label="Cash-on-cash yield"
              value={equityYieldPct !== null ? `${fmtNum2(equityYieldPct)}% p.a.` : "—"}
              tone={equityYieldPct !== null && equityYieldPct >= 0 ? "ok" : "warn"}
            />
            <Metric
              label="Monthly equity cashflow"
              value={fmtMoney2(residual / 12)}
              tone={residual >= 0 ? "ok" : "warn"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "neutral";
}) {
  const valueClass =
    tone === "ok" ? "text-indigo-700" : tone === "warn" ? "text-rose-700" : "text-zinc-800";
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
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
