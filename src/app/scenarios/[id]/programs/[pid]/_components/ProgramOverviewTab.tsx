import Decimal from "decimal.js";
import { fmtMoney2, fmtMoneyInput, fmtNum0 } from "@/utils/format";
import { cloneProgram, deleteProgram, updateProgram } from "../../../_actions";
import { AddProgramModal } from "../../../_components/AddProgramModal";
import { CalibrateProgramButton } from "../../../_components/CalibrateProgramButton";
import type {
  ProgramFeeRow,
  ProgramLiabilityRow,
  ProgramUpfrontFeeRow,
} from "../../../_components/ProgramsTab";
import {
  isFundingTranche,
  type ProgramAggregate,
  type ProgramRow,
} from "../../../_components/ProgramsTab";

const CATEGORY_LABEL: Record<ProgramFeeRow["category"], string> = {
  senior_mgmt: "Senior mgmt",
  subordinate_mgmt: "Sub mgmt",
  servicing: "Servicing",
  trustee: "Trustee fees",
  other: "Other",
};

const CATEGORY_COLOR: Record<ProgramFeeRow["category"], string> = {
  senior_mgmt: "bg-emerald-100 text-emerald-800",
  subordinate_mgmt: "bg-sky-100 text-sky-800",
  servicing: "bg-amber-100 text-amber-800",
  trustee: "bg-violet-100 text-violet-800",
  other: "bg-zinc-100 text-zinc-700",
};

const CALC_LABEL: Record<ProgramLiabilityRow["calculationMethod"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

const UPFRONT_CATEGORY_LABEL: Record<ProgramUpfrontFeeRow["category"], string> = {
  underwriter: "Credit underwriter",
  legal: "Legal",
  credit_rating: "Credit ratings",
  other: "Other",
};

const UPFRONT_CATEGORY_COLOR: Record<ProgramUpfrontFeeRow["category"], string> = {
  underwriter: "bg-indigo-100 text-indigo-800",
  legal: "bg-violet-100 text-violet-800",
  credit_rating: "bg-sky-100 text-sky-800",
  other: "bg-zinc-100 text-zinc-700",
};

function annualFee(f: ProgramFeeRow): Decimal {
  return new Decimal(f.basisAmount.toString()).times(f.feeBps).div(10000);
}

function tranchePrincipal(l: ProgramLiabilityRow, faceValuePerNote: number): number {
  return (l.numNotes ?? 0) * faceValuePerNote;
}

function trancheRateBps(l: ProgramLiabilityRow, baseRateBps: number): number {
  return l.rateType === "variable" ? baseRateBps + l.returnProfileBps : l.returnProfileBps;
}

function toFormInitial(p: ProgramRow) {
  return {
    name: p.name,
    type: p.type,
    dealSize: fmtMoneyInput(p.dealSize?.toString()),
    faceValuePerNote: fmtMoneyInput(p.faceValuePerNote?.toString()) || "1,000.00",
    startPeriodKey: p.startPeriodKey,
    endPeriodKey: p.endPeriodKey ?? "",
    notes: p.notes ?? "",
    arrearsPctTarget: p.arrearsPctTarget
      ? (Number(p.arrearsPctTarget.toString()) * 100).toString()
      : "",
    gallantreeSharePct: p.gallantreeSharePct
      ? (Number(p.gallantreeSharePct.toString()) * 100).toString()
      : "33",
    rampUpMonths: p.rampUpMonths,
    amortisationMonths: p.amortisationMonths,
    fees: p.fees.map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: fmtMoneyInput(f.basisAmount.toString()),
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
    liabilities: (p.liabilities ?? []).map((l) => ({
      name: l.name,
      numNotes: l.numNotes,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode,
    })),
    upfrontFees: (p.upfrontFees ?? []).map((u) => ({
      name: u.name,
      category: u.category,
      amount: fmtMoneyInput(u.amount.toString()),
      accountCode: u.accountCode,
    })),
  };
}

export async function ProgramOverviewTab({
  scenarioId,
  program,
  aggregate,
  baseRateBps,
}: {
  scenarioId: string;
  program: ProgramRow;
  aggregate: ProgramAggregate;
  baseRateBps: number;
}) {
  const faceValuePerNote = Number(program.faceValuePerNote?.toString() ?? "0");

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

  const nimBps = waSpreadBps !== null ? Math.round(waSpreadBps) - aggregate.fundingWasBps : null;
  const nimAnnual = nimBps !== null ? (aggregate.totalBalance * nimBps) / 10000 : null;

  const liabilities = program.liabilities ?? [];
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

  const upfrontTotal = (program.upfrontFees ?? []).reduce(
    (acc, u) => acc + Number(u.amount.toString()),
    0,
  );

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-end gap-2">
        <AddProgramModal
          defaultStartPeriod={program.startPeriodKey}
          expenseAccountsForOverride={[]}
          initial={toFormInitial(program)}
          saveAction={updateProgram.bind(null, scenarioId, program._id)}
          triggerLabel="Edit"
          triggerClassName="rounded px-3 py-1.5 text-xs border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
          baseRateBps={baseRateBps}
        />
        <CalibrateProgramButton scenarioId={scenarioId} programId={program._id} />
        <form action={cloneProgram.bind(null, scenarioId, program._id)}>
          <button
            type="submit"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Clone
          </button>
        </form>
        <form action={deleteProgram.bind(null, scenarioId, program._id)}>
          <button
            type="submit"
            className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
          >
            Delete
          </button>
        </form>
      </div>

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
        {aggregate.loanCount === 0 ? (
          <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
            No loans aligned to this program yet — assign loans from the Loan Book tab.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-6">
              <Mini label="Loans" value={fmtNum0(aggregate.loanCount)} />
              <Mini label="Aggregate balance" value={fmtMoney2(aggregate.totalBalance)} />
              <Mini
                label="WA score"
                value={waScore !== null ? waScore.toFixed(1) : "—"}
                sub="balance-weighted"
              />
              <Mini label="WA LVR" value={waLvr !== null ? `${(waLvr * 100).toFixed(1)}%` : "—"} />
              <Mini label="WA DSCR" value={waDscr !== null ? `${waDscr.toFixed(2)}x` : "—"} />
              <Mini
                label="WA spread"
                value={waSpreadBps !== null ? `${Math.round(waSpreadBps)} bps` : "—"}
                sub="loans"
              />
            </div>
            <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-4">
              <Mini
                label="Liabilities WAS"
                value={aggregate.fundingWasBps > 0 ? `${aggregate.fundingWasBps} bps` : "—"}
                sub="debt tranches, ex equity"
              />
              <Mini
                label="Assets WAS"
                value={waSpreadBps !== null ? `${Math.round(waSpreadBps)} bps` : "—"}
                sub="loans, balance-weighted"
              />
              <Mini
                label="Program NIM"
                value={nimBps !== null ? `${nimBps} bps` : "—"}
                tone={nimBps !== null && nimBps < 0 ? "warn" : nimBps !== null ? "ok" : undefined}
              />
              <Mini
                label="Program NIM $/yr"
                value={nimAnnual !== null ? fmtMoney2(nimAnnual) : "—"}
                tone={
                  nimAnnual !== null && nimAnnual < 0
                    ? "warn"
                    : nimAnnual !== null
                      ? "ok"
                      : undefined
                }
              />
            </div>
          </>
        )}

        {program.notes ? (
          <div className="border-b border-zinc-100 bg-amber-50/40 px-4 py-1.5 text-[11px] text-zinc-700">
            {program.notes}
          </div>
        ) : null}

        {program.fees.length === 0 ? (
          <div className="px-4 py-3 text-xs text-zinc-500">No fee streams configured.</div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="bg-white text-zinc-500">
              <tr>
                <Th>Fee</Th>
                <Th>Category</Th>
                <Th className="text-right">Basis $</Th>
                <Th className="text-right">bps</Th>
                <Th className="text-right">$ / yr</Th>
                <Th className="text-right">$ / mo</Th>
                <Th>Account</Th>
              </tr>
            </thead>
            <tbody>
              {program.fees.map((f) => {
                const annual = annualFee(f);
                return (
                  <tr key={f._id} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                    <Td className="font-medium">{f.name}</Td>
                    <Td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${CATEGORY_COLOR[f.category]}`}
                      >
                        {CATEGORY_LABEL[f.category]}
                      </span>
                    </Td>
                    <Td className="text-right tabular-nums">
                      {fmtMoney2(f.basisAmount.toString())}
                    </Td>
                    <Td className="text-right tabular-nums">{f.feeBps}</Td>
                    <Td className="text-right font-semibold tabular-nums text-emerald-700">
                      {fmtMoney2(annual.toFixed(2))}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-600">
                      {fmtMoney2(annual.div(12).toFixed(2))}
                    </Td>
                    <Td className="font-mono text-[11px] text-zinc-500">{f.accountCode}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {liabilities.length > 0 ? (
          <div className="border-t border-zinc-100">
            <div className="flex items-baseline justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Liability streams · notes issued
              </span>
              <span className="flex items-baseline gap-4 text-[11px] text-zinc-500">
                <span>
                  WAS{" "}
                  <span className="font-semibold text-zinc-700">
                    {liabWasBps !== null ? `${liabWasBps} bps` : "—"}
                  </span>
                  <span className="ml-1 text-zinc-400">· debt tranches</span>
                </span>
                <span>
                  Annual interest{" "}
                  <span className="font-semibold text-rose-700">
                    {fmtMoney2(totalAnnualInterest)}
                  </span>
                </span>
              </span>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-white text-zinc-500">
                <tr>
                  <Th>Tranche</Th>
                  <Th className="text-right"># notes</Th>
                  <Th className="text-right">Spread (bps)</Th>
                  <Th>Calc</Th>
                  <Th>Rate</Th>
                  <Th className="text-right">All-in rate</Th>
                  <Th className="text-right">$ / yr</Th>
                  <Th className="text-right">$ / mo</Th>
                  <Th>Account</Th>
                </tr>
              </thead>
              <tbody>
                {liabilities.map((l) => {
                  const principal = tranchePrincipal(l, faceValuePerNote);
                  const rateBps = trancheRateBps(l, baseRateBps);
                  const annual = (principal * rateBps) / 10000;
                  const monthly = annual / 12;
                  return (
                    <tr key={l._id} className="border-t border-zinc-100">
                      <Td className="font-medium">{l.name}</Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {l.numNotes !== undefined ? l.numNotes : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {l.returnProfileBps}
                      </Td>
                      <Td className="text-zinc-600">{CALC_LABEL[l.calculationMethod]}</Td>
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
                      <Td className="text-right font-semibold tabular-nums text-rose-700">
                        {annual > 0 ? fmtMoney2(annual) : "—"}
                      </Td>
                      <Td className="text-right tabular-nums text-zinc-600">
                        {monthly > 0 ? fmtMoney2(monthly) : "—"}
                      </Td>
                      <Td className="font-mono text-[11px] text-zinc-500">
                        {l.accountCode ?? "—"}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {(program.upfrontFees ?? []).length > 0 ? (
          <div className="border-t border-zinc-100">
            <div className="flex items-baseline justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                Upfront issuance costs · one-off
              </span>
              <span className="text-[11px] text-zinc-500">
                Total <span className="font-semibold text-rose-700">{fmtMoney2(upfrontTotal)}</span>
              </span>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-white text-zinc-500">
                <tr>
                  <Th>Fee</Th>
                  <Th>Category</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Account</Th>
                </tr>
              </thead>
              <tbody>
                {(program.upfrontFees ?? []).map((u) => (
                  <tr key={u._id} className="border-t border-zinc-100">
                    <Td className="font-medium">{u.name}</Td>
                    <Td>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${UPFRONT_CATEGORY_COLOR[u.category]}`}
                      >
                        {UPFRONT_CATEGORY_LABEL[u.category]}
                      </span>
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-rose-700">
                      {fmtMoney2(u.amount.toString())}
                    </Td>
                    <Td className="font-mono text-[11px] text-zinc-500">{u.accountCode ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Mini({
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
