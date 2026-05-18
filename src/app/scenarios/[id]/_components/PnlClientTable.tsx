"use client";

import { Fragment, useState } from "react";
import { fmtNum0 } from "@/utils/format";
import { AddOpexDriverModal, type OpexDriverFormInitial } from "./AddOpexDriverModal";
import type { OpexDriverPayload } from "../_actions";

export interface FYGroup {
  fy: number;
  months: string[];
}

export interface SerializedItem {
  id: string;
  label: string;
  source:
    | "driver"
    | "headcount"
    | "loan"
    | "program_fee"
    | "platform_license"
    | "program_liability";
  monthly: Record<string, string>; // periodKey -> value
}

export interface SerializedLine {
  accountCode: string;
  items: SerializedItem[];
  monthly: Record<string, string>;
}

export interface SerializedSection {
  lines: SerializedLine[];
  totals: Record<string, string>;
}

export interface OpexItemEditTarget {
  formInitial: OpexDriverFormInitial;
  updateAction: (payload: OpexDriverPayload) => Promise<void>;
  deleteAction: () => Promise<void>;
}

export interface PnlCascadeSeries {
  ebitda: Record<string, string>;
  depreciation: Record<string, string>;
  ebit: Record<string, string>;
  interestExpense: Record<string, string>;
  pretaxIncome: Record<string, string>;
  taxExpense: Record<string, string>;
  netIncome: Record<string, string>;
}

export interface PnlClientTableProps {
  horizon: string[];
  groups: FYGroup[];
  accountByCode: Record<string, string>;
  revenue?: SerializedSection;
  opex?: SerializedSection;
  grossProfit?: Record<string, string>;
  cascade?: PnlCascadeSeries;
  showSection: "both" | "revenue" | "opex";
  initiallyExpandedThreshold?: number;
  // OPEX edit affordance (optional). When provided, driver items with a
  // matching entry get an inline Edit + Delete affordance next to their label.
  opexItemEditTargets?: Record<string, OpexItemEditTarget>;
  expenseAccounts?: { code: string; name: string }[];
  defaultStartPeriod?: string;
}

const SOURCE_LABEL: Record<SerializedItem["source"], string> = {
  driver: "driver",
  headcount: "staff",
  loan: "loan",
  program_fee: "fee",
  platform_license: "licence",
  program_liability: "liability",
};

function fySum(values: Record<string, string>, months: string[]): number {
  let s = 0;
  for (const m of months) s += Number(values[m] ?? "0");
  return s;
}

function lineTotal(values: Record<string, string>, horizon: string[]): number {
  let s = 0;
  for (const m of horizon) s += Number(values[m] ?? "0");
  return s;
}

export function PnlClientTable(props: PnlClientTableProps) {
  const {
    horizon,
    groups,
    accountByCode,
    revenue,
    opex,
    grossProfit,
    showSection,
    initiallyExpandedThreshold = 5,
    opexItemEditTargets,
    expenseAccounts,
    defaultStartPeriod,
    cascade,
  } = props;

  // Per-account expand state; default expanded only when item count is small.
  const allLines = [...(revenue?.lines ?? []), ...(opex?.lines ?? [])];
  const initial: Record<string, boolean> = {};
  for (const l of allLines) initial[l.accountCode] = l.items.length <= initiallyExpandedThreshold;
  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial);

  function toggle(code: string) {
    setExpanded((s) => ({ ...s, [code]: !s[code] }));
  }

  const totalCols = 1 + groups.reduce((acc, g) => acc + g.months.length + 1, 0);

  function renderSection(section: SerializedSection, header: string, colorClass: string) {
    return (
      <>
        <tr>
          <td
            colSpan={totalCols}
            className={`border-b border-t-2 border-zinc-400 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${colorClass}`}
          >
            {header}
          </td>
        </tr>
        {section.lines.map((line) => {
          const isOpen = expanded[line.accountCode] ?? false;
          const total = lineTotal(line.monthly, horizon);
          return (
            <Fragment key={line.accountCode}>
              {/* Account roll-up row — clickable */}
              <tr
                className="cursor-pointer bg-zinc-50/60 hover:bg-yellow-50/40"
                onClick={() => toggle(line.accountCode)}
              >
                <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-200 bg-zinc-50/60 px-3 py-1.5 font-semibold">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle(line.accountCode);
                    }}
                    aria-label={isOpen ? "Collapse account" : "Expand account"}
                    className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
                  >
                    <span
                      className={`inline-block text-[10px] transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    >
                      ▶
                    </span>
                  </button>
                  <span className="font-mono text-zinc-500">{line.accountCode}</span>{" "}
                  {accountByCode[line.accountCode] ?? ""}
                  {line.items.length > 1 ? (
                    <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      {line.items.length}
                    </span>
                  ) : null}
                </td>
                {groups.map((g) => {
                  const fyTotal = fySum(line.monthly, g.months);
                  return (
                    <Fragment key={`${line.accountCode}-fy${g.fy}`}>
                      {g.months.map((pk) => (
                        <td
                          key={`${line.accountCode}-${pk}`}
                          className="border-b border-zinc-200 px-2 py-1.5 text-right font-semibold tabular-nums text-zinc-900"
                        >
                          {fmtNum0(line.monthly[pk] ?? "0")}
                        </td>
                      ))}
                      <td className="border-b border-r border-zinc-300 bg-zinc-100 px-2 py-1.5 text-right font-bold tabular-nums text-zinc-900">
                        {fmtNum0(fyTotal)}
                      </td>
                    </Fragment>
                  );
                })}
              </tr>

              {/* Per-item sub-rows — only when expanded */}
              {isOpen &&
                line.items.map((item) => {
                  const editTarget =
                    opexItemEditTargets && item.source === "driver"
                      ? opexItemEditTargets[item.id]
                      : undefined;
                  return (
                  <tr key={`${line.accountCode}-${item.id}`} className="group hover:bg-yellow-50/30">
                    <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-100 bg-white px-3 py-1 pl-10 text-zinc-600">
                      <span className="text-zinc-300">↳</span>{" "}
                      <span className="text-zinc-700">{item.label}</span>
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-400">
                        {SOURCE_LABEL[item.source]}
                      </span>
                      {editTarget && expenseAccounts && defaultStartPeriod ? (
                        <span className="ml-2 inline-flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                          <AddOpexDriverModal
                            defaultStartPeriod={defaultStartPeriod}
                            expenseAccounts={expenseAccounts}
                            initial={editTarget.formInitial}
                            saveAction={editTarget.updateAction}
                            triggerLabel="Edit"
                            triggerClassName="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
                          />
                          <form action={editTarget.deleteAction}>
                            <button
                              type="submit"
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label={`Delete driver ${item.label}`}
                            >
                              Delete
                            </button>
                          </form>
                        </span>
                      ) : null}
                    </td>
                    {groups.map((g) => {
                      const fyTotal = fySum(item.monthly, g.months);
                      return (
                        <Fragment key={`${item.id}-fy${g.fy}`}>
                          {g.months.map((pk) => {
                            const v = Number(item.monthly[pk] ?? "0");
                            return (
                              <td
                                key={`${item.id}-${pk}`}
                                className="border-b border-zinc-100 px-2 py-1 text-right tabular-nums text-zinc-500"
                              >
                                {v === 0 ? (
                                  <span className="text-zinc-300">—</span>
                                ) : (
                                  fmtNum0(v)
                                )}
                              </td>
                            );
                          })}
                          <td className="border-b border-r border-zinc-200 bg-zinc-50/40 px-2 py-1 text-right tabular-nums text-zinc-700">
                            {fyTotal === 0 ? (
                              <span className="text-zinc-300">—</span>
                            ) : (
                              fmtNum0(fyTotal)
                            )}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                  );
                })}

              {/* Use total to silence unused-var lint */}
              {total < Number.NEGATIVE_INFINITY ? <tr /> : null}
            </Fragment>
          );
        })}

        {/* Section total row */}
        <SectionTotalRow
          label={`Total ${header.toLowerCase()}`}
          totals={section.totals}
          horizon={horizon}
          groups={groups}
        />
      </>
    );
  }

  return (
    <table className="border-collapse text-xs">
      <thead>
        <tr className="bg-zinc-100 text-zinc-600">
          <th className="sticky left-0 z-30 w-72 border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-left font-medium">
            Account
          </th>
          {groups.map((g) => (
            <th
              key={`fyhead-${g.fy}`}
              colSpan={g.months.length + 1}
              className="border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-center font-semibold tracking-wide"
            >
              FY{String(g.fy).slice(-2)}
            </th>
          ))}
        </tr>
        <tr className="bg-zinc-50 text-[11px] text-zinc-500">
          <th className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left">
            <ExpandAllControls
              accountCodes={allLines.map((l) => l.accountCode)}
              expanded={expanded}
              setExpanded={setExpanded}
            />
          </th>
          {groups.map((g) => (
            <Fragment key={`hdr-fy-${g.fy}`}>
              {g.months.map((pk) => (
                <th
                  key={`hdr-${pk}`}
                  className="min-w-[78px] border-b border-zinc-200 px-2 py-1.5 text-right font-mono font-normal"
                >
                  {pk.slice(2)}
                </th>
              ))}
              <th className="min-w-[96px] border-b border-r border-zinc-300 bg-zinc-100 px-2 py-1.5 text-right font-semibold text-zinc-700">
                FY{String(g.fy).slice(-2)} total
              </th>
            </Fragment>
          ))}
        </tr>
      </thead>
      <tbody>
        {(showSection === "both" || showSection === "revenue") && revenue
          ? renderSection(revenue, "Revenue", "bg-emerald-50 text-emerald-800")
          : null}
        {(showSection === "both" || showSection === "opex") && opex
          ? renderSection(opex, "Operating expenses", "bg-rose-50 text-rose-800")
          : null}
        {showSection === "both" && grossProfit && !cascade ? (
          <SectionTotalRow
            label="Gross profit"
            totals={grossProfit}
            horizon={horizon}
            groups={groups}
            variant="grand"
          />
        ) : null}
        {showSection === "both" && cascade ? (
          <>
            <tr>
              <td
                colSpan={totalCols}
                className="border-b border-t-2 border-zinc-400 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-800"
              >
                Profitability cascade
              </td>
            </tr>
            <SectionTotalRow
              label="EBITDA"
              totals={cascade.ebitda}
              horizon={horizon}
              groups={groups}
              variant="section"
            />
            <CascadeNegativeRow
              label="Less: Depreciation"
              totals={cascade.depreciation}
              horizon={horizon}
              groups={groups}
            />
            <SectionTotalRow
              label="EBIT (Operating income)"
              totals={cascade.ebit}
              horizon={horizon}
              groups={groups}
              variant="section"
            />
            <CascadeNegativeRow
              label="Less: Interest expense"
              totals={cascade.interestExpense}
              horizon={horizon}
              groups={groups}
            />
            <SectionTotalRow
              label="Pre-tax income"
              totals={cascade.pretaxIncome}
              horizon={horizon}
              groups={groups}
              variant="section"
            />
            <CascadeNegativeRow
              label="Less: Tax"
              totals={cascade.taxExpense}
              horizon={horizon}
              groups={groups}
            />
            <SectionTotalRow
              label="Net income"
              totals={cascade.netIncome}
              horizon={horizon}
              groups={groups}
              variant="grand"
            />
          </>
        ) : null}
      </tbody>
    </table>
  );
}

function CascadeNegativeRow({
  label,
  totals,
  horizon,
  groups,
}: {
  label: string;
  totals: Record<string, string>;
  horizon: string[];
  groups: FYGroup[];
}) {
  void horizon;
  return (
    <tr className="text-zinc-600 hover:bg-yellow-50/30">
      <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-100 bg-white px-3 py-1 pl-8 italic">
        {label}
      </td>
      {groups.map((g) => {
        const fyTotal = fySum(totals, g.months);
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => {
              const v = Number(totals[pk] ?? "0");
              return (
                <td
                  key={`${label}-${pk}`}
                  className="border-b border-zinc-100 px-2 py-1 text-right tabular-nums"
                >
                  {v === 0 ? (
                    <span className="text-zinc-300">—</span>
                  ) : (
                    `(${fmtNum0(Math.abs(v))})`
                  )}
                </td>
              );
            })}
            <td className="border-b border-r border-zinc-200 bg-zinc-50/40 px-2 py-1 text-right tabular-nums">
              {fyTotal === 0 ? (
                <span className="text-zinc-300">—</span>
              ) : (
                `(${fmtNum0(Math.abs(fyTotal))})`
              )}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function SectionTotalRow({
  label,
  totals,
  horizon,
  groups,
  variant = "section",
}: {
  label: string;
  totals: Record<string, string>;
  horizon: string[];
  groups: FYGroup[];
  variant?: "section" | "grand";
}) {
  const cls =
    variant === "grand"
      ? "bg-zinc-200 font-bold text-zinc-900"
      : "bg-zinc-100 font-semibold text-zinc-900";
  const border = "border-t-2 border-zinc-400";
  void horizon;
  return (
    <tr className={cls}>
      <td className={`sticky left-0 z-20 ${border} border-r bg-inherit px-3 py-1.5`}>{label}</td>
      {groups.map((g) => (
        <Fragment key={`${label}-fy${g.fy}`}>
          {g.months.map((pk) => (
            <td
              key={`${label}-${pk}`}
              className={`${border} px-2 py-1.5 text-right tabular-nums`}
            >
              {fmtNum0(totals[pk] ?? "0")}
            </td>
          ))}
          <td className={`${border} border-r bg-zinc-200 px-2 py-1.5 text-right tabular-nums`}>
            {fmtNum0(fySum(totals, g.months))}
          </td>
        </Fragment>
      ))}
    </tr>
  );
}

function ExpandAllControls({
  accountCodes,
  expanded,
  setExpanded,
}: {
  accountCodes: string[];
  expanded: Record<string, boolean>;
  setExpanded: (s: Record<string, boolean>) => void;
}) {
  const allOpen = accountCodes.every((c) => expanded[c]);
  return (
    <button
      type="button"
      onClick={() => {
        const next: Record<string, boolean> = {};
        for (const c of accountCodes) next[c] = !allOpen;
        setExpanded(next);
      }}
      className="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
    >
      {allOpen ? "Collapse all" : "Expand all"}
    </button>
  );
}
