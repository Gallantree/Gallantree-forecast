import Decimal from "decimal.js";
import { fmtMoney2, fmtMoneyInput, fmtNum0 } from "@/utils/format";
import { createProgram, deleteProgram, updateProgram } from "../_actions";
import { AddProgramModal, type ProgramFormInitial } from "./AddProgramModal";

export interface ProgramFeeRow {
  _id: string;
  name: string;
  category: "senior_mgmt" | "subordinate_mgmt" | "servicing" | "other";
  basisAmount: { toString: () => string };
  feeBps: number;
  accountCode: string;
}

export interface ProgramRow {
  _id: string;
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  dealSize?: { toString: () => string };
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: ProgramFeeRow[];
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
  };
}

export function ProgramsTab({
  scenarioId,
  programs,
  expenseAccounts,
  defaultStartPeriod,
}: {
  scenarioId: string;
  programs: ProgramRow[];
  expenseAccounts: { code: string; name: string }[];
  defaultStartPeriod: string;
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
        <AddProgramModal
          defaultStartPeriod={defaultStartPeriod}
          expenseAccountsForOverride={expenseAccounts}
          createAction={createAction}
        />
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
                      />
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
                </section>
              );
            })}
          </div>
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
