import Decimal from "decimal.js";
import { fmtMoney2, fmtMoneyInput, fmtNum0 } from "@/utils/format";
import { cloneProgram, createProgram, deleteProgram, updateProgram } from "../_actions";
import { AddProgramModal, type ProgramFormInitial } from "./AddProgramModal";
import { CalibrateProgramButton } from "./CalibrateProgramButton";
import { SeedMenu } from "./SeedMenu";
import {
  seedCmbsPrograms,
  seedCreCloPrograms,
  seedLoanBook,
} from "../_actions";

export interface ProgramFeeRow {
  _id: string;
  name: string;
  category: "senior_mgmt" | "subordinate_mgmt" | "servicing" | "other";
  basisAmount: { toString: () => string };
  feeBps: number;
  accountCode: string;
}

export interface ProgramLiabilityRow {
  _id: string;
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: "monthly" | "quarterly" | "annually";
  rateType: "fixed" | "variable";
  accountCode?: string;
}

export interface ProgramAggregate {
  loanCount: number;
  totalBalance: number;
  weightSumScore: number;
  weightSumLvr: number;
  weightSumDscr: number;
  weightSumSpreadBps: number;
  weightBalanceForScore: number;
  weightBalanceForLvr: number;
  weightBalanceForDscr: number;
  weightBalanceForSpread: number;
  // Funding-side assessment: WAS of debt tranches in this program (excl equity),
  // weighted by principal. Used to compute program NIM = loan WAS − funding WAS.
  fundingWasBps: number;
}

export interface ProgramRow {
  _id: string;
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  dealSize?: { toString: () => string };
  faceValuePerNote?: { toString: () => string };
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: ProgramFeeRow[];
  liabilities?: ProgramLiabilityRow[];
}

const TYPE_LABEL: Record<ProgramRow["type"], string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  MIT_FUND: "MIT Fund",
  WAREHOUSE: "Warehouse",
  OTHER: "Other",
};

const CATEGORY_LABEL: Record<ProgramFeeRow["category"], string> = {
  senior_mgmt: "Senior mgmt",
  subordinate_mgmt: "Sub mgmt",
  servicing: "Servicing",
  other: "Other",
};

const CATEGORY_COLOR: Record<ProgramFeeRow["category"], string> = {
  senior_mgmt: "bg-emerald-100 text-emerald-800",
  subordinate_mgmt: "bg-sky-100 text-sky-800",
  servicing: "bg-amber-100 text-amber-800",
  other: "bg-zinc-100 text-zinc-700",
};

function annualFee(f: ProgramFeeRow): Decimal {
  return new Decimal(f.basisAmount.toString()).times(f.feeBps).div(10000);
}

function toFormInitial(p: ProgramRow): ProgramFormInitial {
  return {
    name: p.name,
    type: p.type,
    dealSize: fmtMoneyInput(p.dealSize?.toString()),
    faceValuePerNote: fmtMoneyInput(p.faceValuePerNote?.toString()) || "1,000.00",
    startPeriodKey: p.startPeriodKey,
    endPeriodKey: p.endPeriodKey ?? "",
    notes: p.notes ?? "",
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
  };
}

export function ProgramsTab({
  scenarioId,
  programs,
  aggregates,
  expenseAccounts,
  defaultStartPeriod,
  baseRateBps,
  seedEnabled,
}: {
  scenarioId: string;
  programs: ProgramRow[];
  aggregates: Record<string, ProgramAggregate>;
  expenseAccounts: { code: string; name: string }[];
  defaultStartPeriod: string;
  baseRateBps: number;
  seedEnabled: boolean;
}) {
  const createAction = createProgram.bind(null, scenarioId);

  const totalAnnualFees = programs.reduce(
    (acc, p) =>
      acc.plus(p.fees.reduce((a, f) => a.plus(annualFee(f)), new Decimal(0))),
    new Decimal(0),
  );

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Toolbar */}
      <div className="flex items-end justify-between gap-4 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <div className="flex gap-6">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Programs
            </div>
            <div className="text-base font-semibold text-zinc-900">{programs.length}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Total annual fees
            </div>
            <div className="text-base font-semibold text-emerald-700">
              {fmtMoney2(totalAnnualFees.toFixed(2))}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Fee streams
            </div>
            <div className="text-base font-semibold text-zinc-900">
              {fmtNum0(programs.reduce((acc, p) => acc + p.fees.length, 0))}
            </div>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <SeedMenu
            scenarioId={scenarioId}
            enabled={seedEnabled}
            options={[
              {
                key: "cre-clo",
                label: "CRE CLO programs",
                description:
                  "4 CRE CLOs (FL-1 matches Gallantree's anchor deal; FL-2 through FL-4 spaced 4 months apart, randomized within your spread bands).",
                action: seedCreCloPrograms,
              },
              {
                key: "cmbs",
                label: "CMBS + Warehouse",
                description:
                  "4 CMBS deals (tighter spreads, A 120-130, A-S 145-155…) plus 1 warehouse facility.",
                action: seedCmbsPrograms,
              },
              {
                key: "loan-book",
                label: "Loan book (250 loans)",
                description:
                  "250 loans across existing CRE CLO / CMBS / Warehouse programs. Run program seeds first.",
                action: seedLoanBook,
              },
            ]}
          />
          <AddProgramModal
            defaultStartPeriod={defaultStartPeriod}
            expenseAccountsForOverride={expenseAccounts}
            createAction={createAction}
            baseRateBps={baseRateBps}
          />
        </div>
      </div>

      {/* Program list */}
      <div className="flex-1 overflow-auto">
        {programs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
            <div>No capital programs yet.</div>
            <div className="text-xs">
              Click <span className="font-medium text-zinc-700">Add capital program</span> to
              create a CLO, CMBS trust, MIT fund or warehouse facility.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            {programs.map((p) => {
              const programAnnual = p.fees.reduce(
                (acc, f) => acc.plus(annualFee(f)),
                new Decimal(0),
              );
              return (
                <section
                  key={p._id}
                  className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm"
                >
                  <header className="flex items-baseline justify-between border-b border-zinc-200 bg-zinc-50 px-4 py-2">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-sm font-semibold text-zinc-900">{p.name}</h3>
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-700">
                        {TYPE_LABEL[p.type]}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-500">
                        {p.startPeriodKey}
                        {p.endPeriodKey ? ` → ${p.endPeriodKey}` : ""}
                      </span>
                      {p.dealSize ? (
                        <span className="text-[11px] text-zinc-500">
                          Deal size{" "}
                          <span className="font-semibold text-zinc-700">
                            {fmtMoney2(p.dealSize.toString())}
                          </span>
                        </span>
                      ) : null}
                      {p.dealSize && p.faceValuePerNote ? (() => {
                        const d = Number(p.dealSize!.toString());
                        const f = Number(p.faceValuePerNote!.toString());
                        if (!(f > 0)) return null;
                        const notes = d / f;
                        return (
                          <span className="text-[11px] text-zinc-500">
                            Notes{" "}
                            <span className="font-semibold text-zinc-700">
                              {notes.toLocaleString("en-AU", { maximumFractionDigits: 0 })}
                            </span>
                            <span className="ml-1 text-zinc-400">
                              @ {fmtMoney2(p.faceValuePerNote!.toString())}
                            </span>
                          </span>
                        );
                      })() : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-zinc-500">
                        Annual fees{" "}
                        <span className="font-semibold text-emerald-700">
                          {fmtMoney2(programAnnual.toFixed(2))}
                        </span>
                      </span>
                      <AddProgramModal
                        defaultStartPeriod={defaultStartPeriod}
                        expenseAccountsForOverride={expenseAccounts}
                        initial={toFormInitial(p)}
                        saveAction={updateProgram.bind(null, scenarioId, p._id)}
                        triggerLabel="Edit"
                        triggerClassName="rounded px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        baseRateBps={baseRateBps}
                      />
                      <CalibrateProgramButton
                        scenarioId={scenarioId}
                        programId={p._id}
                      />
                      <form action={cloneProgram.bind(null, scenarioId, p._id)}>
                        <button
                          type="submit"
                          className="rounded px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          Clone
                        </button>
                      </form>
                      <form action={deleteProgram.bind(null, scenarioId, p._id)}>
                        <button
                          type="submit"
                          className="rounded px-2 py-0.5 text-xs text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </header>
                  <ProgramAggregateStrip agg={aggregates[p._id]} />
                  {p.notes ? (
                    <div className="border-b border-zinc-100 bg-amber-50/40 px-4 py-1.5 text-[11px] text-zinc-700">
                      {p.notes}
                    </div>
                  ) : null}
                  {p.fees.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-500">
                      No fee streams configured.
                    </div>
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
                        {p.fees.map((f) => {
                          const annual = annualFee(f);
                          return (
                            <tr
                              key={f._id}
                              className="border-t border-zinc-100 hover:bg-yellow-50/40"
                            >
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
                              <Td className="font-mono text-[11px] text-zinc-500">
                                {f.accountCode}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  <LiabilitiesBlock
                    liabilities={p.liabilities ?? []}
                    faceValuePerNote={Number(p.faceValuePerNote?.toString() ?? "0")}
                    baseRateBps={baseRateBps}
                  />
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const CALC_LABEL: Record<ProgramLiabilityRow["calculationMethod"], string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

function tranchePrincipal(l: ProgramLiabilityRow, faceValuePerNote: number): number {
  return (l.numNotes ?? 0) * faceValuePerNote;
}

function trancheRateBps(l: ProgramLiabilityRow, baseRateBps: number): number {
  return l.rateType === "variable"
    ? baseRateBps + l.returnProfileBps
    : l.returnProfileBps;
}

// A tranche is "funding" if it represents principal-paying debt (A–G in CRE
// CLO / CMBS conventions). Excludes equity/residual + structural control
// classes (X, Class X, IO) + zero/negative-spread tranches. Used by the WAS
// calc so the funding cost reflects real debt, not structure.
const NON_FUNDING_TRANCHE_NAMES = new Set([
  "equity",
  "x",
  "class x",
  "io",
  "interest only",
  "interest-only",
]);

export function isFundingTranche(
  name: string | undefined,
  spreadBps: number,
): boolean {
  if (spreadBps <= 0) return false;
  const norm = (name ?? "").trim().toLowerCase();
  if (!norm) return true; // unnamed but positive-spread → assume funding
  return !NON_FUNDING_TRANCHE_NAMES.has(norm);
}

function LiabilitiesBlock({
  liabilities,
  faceValuePerNote,
  baseRateBps,
}: {
  liabilities: ProgramLiabilityRow[];
  faceValuePerNote: number;
  baseRateBps: number;
}) {
  if (liabilities.length === 0) return null;
  const totalAnnual = liabilities.reduce(
    (acc, l) =>
      acc + (tranchePrincipal(l, faceValuePerNote) * trancheRateBps(l, baseRateBps)) / 10000,
    0,
  );
  // Liability WAS: weighted-avg spread across the principal-paying debt
  // tranches (A through G in CRE CLO / CMBS conventions). Excludes:
  //   - Equity / residual tranches
  //   - Control / IO classes (X, Class X, IO) — these are structural, not funding
  //   - Any tranche with zero or negative spread
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
              {fmtMoney2(totalAnnual)}
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
                <Td className="text-right tabular-nums text-zinc-600">{l.returnProfileBps}</Td>
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
  );
}

function ProgramAggregateStrip({ agg }: { agg: ProgramAggregate | undefined }) {
  if (!agg || agg.loanCount === 0) {
    return (
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
        No loans aligned to this program yet — assign loans from the Loan Book tab.
      </div>
    );
  }
  const waScore =
    agg.weightBalanceForScore > 0
      ? agg.weightSumScore / agg.weightBalanceForScore
      : null;
  const waLvr =
    agg.weightBalanceForLvr > 0 ? agg.weightSumLvr / agg.weightBalanceForLvr : null;
  const waDscr =
    agg.weightBalanceForDscr > 0 ? agg.weightSumDscr / agg.weightBalanceForDscr : null;
  const waSpreadBps =
    agg.weightBalanceForSpread > 0
      ? agg.weightSumSpreadBps / agg.weightBalanceForSpread
      : null;

  // Program NIM = (loan WAS) − (funding WAS), expressed as a spread.
  // NIM $/yr applies that spread to the aggregate loan balance.
  const nimBps =
    waSpreadBps !== null ? Math.round(waSpreadBps) - agg.fundingWasBps : null;
  const nimAnnual =
    nimBps !== null ? (agg.totalBalance * nimBps) / 10000 : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-6">
        <Mini label="Loans" value={fmtNum0(agg.loanCount)} />
        <Mini label="Aggregate balance" value={fmtMoney2(agg.totalBalance)} />
        <Mini
          label="WA score"
          value={waScore !== null ? waScore.toFixed(1) : "—"}
          sub="balance-weighted"
        />
        <Mini
          label="WA LVR"
          value={waLvr !== null ? `${(waLvr * 100).toFixed(1)}%` : "—"}
        />
        <Mini
          label="WA DSCR"
          value={waDscr !== null ? `${waDscr.toFixed(2)}x` : "—"}
        />
        <Mini
          label="WA spread"
          value={waSpreadBps !== null ? `${Math.round(waSpreadBps)} bps` : "—"}
          sub="loans"
        />
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-4">
        <Mini
          label="Liabilities WAS"
          value={agg.fundingWasBps > 0 ? `${agg.fundingWasBps} bps` : "—"}
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
    tone === "warn"
      ? "text-rose-700"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-zinc-900";
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
