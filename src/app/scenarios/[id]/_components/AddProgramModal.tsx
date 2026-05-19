"use client";

import { useRef, useState, useTransition } from "react";
import { parseDecimalInput } from "@/utils/format";
import type { ProgramFeePayload, ProgramLiabilityPayload, ProgramPayload } from "../_actions";

interface LiabilityRow extends ProgramLiabilityPayload {
  rowKey: string;
}

const CALC_METHODS: { value: ProgramLiabilityPayload["calculationMethod"]; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const LIABILITY_ACCOUNTS: { code: string; label: string }[] = [
  { code: "6800", label: "6800 Interest expense — senior notes" },
  { code: "6810", label: "6810 Interest expense — subordinate notes" },
  { code: "6820", label: "6820 Interest expense — other tranches" },
];

function makeLiabilityRow(): LiabilityRow {
  return {
    rowKey: crypto.randomUUID(),
    name: "",
    numNotes: undefined,
    returnProfileBps: 0,
    calculationMethod: "monthly",
    rateType: "fixed",
    accountCode: "6800",
  };
}

const PROGRAM_TYPES: { value: ProgramPayload["type"]; label: string }[] = [
  { value: "CRE_CLO", label: "CRE CLO" },
  { value: "CMBS", label: "CMBS" },
  { value: "MIT_FUND", label: "MIT Fund" },
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "OTHER", label: "Other" },
];

const FEE_CATEGORIES: {
  value: ProgramFeePayload["category"];
  label: string;
  defaultAccount: string;
}[] = [
  { value: "senior_mgmt", label: "Senior mgmt", defaultAccount: "4500" },
  { value: "subordinate_mgmt", label: "Sub mgmt", defaultAccount: "4510" },
  { value: "servicing", label: "Servicing", defaultAccount: "4520" },
  { value: "other", label: "Other", defaultAccount: "4530" },
];

const ACCOUNT_LABEL: Record<string, string> = {
  "4500": "4500 Senior management fees",
  "4510": "4510 Subordinate management fees",
  "4520": "4520 Servicing fees",
  "4530": "4530 Other capital program fees",
};

interface FeeRow extends ProgramFeePayload {
  rowKey: string;
}

function makeFeeRow(category: ProgramFeePayload["category"], name: string): FeeRow {
  const cat = FEE_CATEGORIES.find((c) => c.value === category)!;
  return {
    rowKey: crypto.randomUUID(),
    name,
    category,
    basisAmount: "0",
    feeBps: 0,
    accountCode: cat.defaultAccount,
  };
}

export type ProgramFormInitial = {
  name: string;
  type: ProgramPayload["type"];
  dealSize?: string;
  faceValuePerNote?: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: ProgramFeePayload[];
  liabilities?: ProgramLiabilityPayload[];
};

function defaultInitial(startPeriod: string): ProgramFormInitial {
  return {
    name: "",
    type: "CRE_CLO",
    dealSize: "",
    faceValuePerNote: "1,000.00",
    startPeriodKey: startPeriod,
    endPeriodKey: "",
    notes: "",
    fees: [],
  };
}

function defaultFeeRows(): FeeRow[] {
  return [
    makeFeeRow("senior_mgmt", "Senior management"),
    makeFeeRow("subordinate_mgmt", "Subordinate management"),
    makeFeeRow("servicing", "Servicing"),
  ];
}

export function AddProgramModal({
  defaultStartPeriod,
  expenseAccountsForOverride,
  createAction,
  initial,
  saveAction,
  triggerLabel,
  saveLabel,
  triggerClassName,
  baseRateBps = 420,
}: {
  defaultStartPeriod: string;
  expenseAccountsForOverride: { code: string; name: string }[];
  // Either createAction (add mode) OR saveAction (edit mode) must be provided.
  createAction?: (payload: ProgramPayload) => Promise<void>;
  saveAction?: (payload: ProgramPayload) => Promise<void>;
  initial?: ProgramFormInitial;
  triggerLabel?: string;
  saveLabel?: string;
  triggerClassName?: string;
  // Scenario-level base rate (BBSW/BBSY/SOFR) used for variable-rate $/yr preview.
  baseRateBps?: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = initial ?? defaultInitial(defaultStartPeriod);
  const [name, setName] = useState(seed.name);
  const [type, setType] = useState<ProgramPayload["type"]>(seed.type);
  const [dealSize, setDealSize] = useState(seed.dealSize ?? "");
  const [faceValuePerNote, setFaceValuePerNote] = useState(seed.faceValuePerNote ?? "1,000.00");
  const [startPeriodKey, setStartPeriodKey] = useState(seed.startPeriodKey);
  const [endPeriodKey, setEndPeriodKey] = useState(seed.endPeriodKey ?? "");
  const [notes, setNotes] = useState(seed.notes ?? "");
  const [fees, setFees] = useState<FeeRow[]>(
    initial ? initial.fees.map((f) => ({ rowKey: crypto.randomUUID(), ...f })) : defaultFeeRows(),
  );
  const [liabilities, setLiabilities] = useState<LiabilityRow[]>(
    initial?.liabilities?.length
      ? initial.liabilities.map((l) => ({ rowKey: crypto.randomUUID(), ...l }))
      : [],
  );

  function reset() {
    const s = initial ?? defaultInitial(defaultStartPeriod);
    setName(s.name);
    setType(s.type);
    setDealSize(s.dealSize ?? "");
    setFaceValuePerNote(s.faceValuePerNote ?? "1,000.00");
    setStartPeriodKey(s.startPeriodKey);
    setEndPeriodKey(s.endPeriodKey ?? "");
    setNotes(s.notes ?? "");
    setFees(
      initial ? s.fees.map((f) => ({ rowKey: crypto.randomUUID(), ...f })) : defaultFeeRows(),
    );
    setLiabilities(
      initial?.liabilities?.length
        ? initial.liabilities.map((l) => ({ rowKey: crypto.randomUUID(), ...l }))
        : [],
    );
  }

  function updateLiability(i: number, patch: Partial<LiabilityRow>) {
    setLiabilities((arr) => arr.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLiability(i: number) {
    setLiabilities((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addLiability() {
    setLiabilities((arr) => [...arr, makeLiabilityRow()]);
  }

  function show() {
    reset();
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function updateFee(i: number, patch: Partial<FeeRow>) {
    setFees((arr) => arr.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function removeFee(i: number) {
    setFees((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addFee() {
    setFees((arr) => [...arr, makeFeeRow("other", "")]);
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const payload: ProgramPayload = {
      name: name.trim(),
      type,
      dealSize: dealSize.trim() || undefined,
      faceValuePerNote: faceValuePerNote.trim() || undefined,
      startPeriodKey,
      endPeriodKey: endPeriodKey.trim() || undefined,
      notes: notes.trim() || undefined,
      fees: fees.map(({ rowKey: _rk, ...f }) => {
        void _rk;
        return f;
      }),
      liabilities: liabilities.map(({ rowKey: _rk, ...l }) => {
        void _rk;
        return l;
      }),
    };
    const action = saveAction ?? createAction;
    if (!action) return;
    startTransition(async () => {
      await action(payload);
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={
          triggerClassName ??
          "rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        }
      >
        {triggerLabel ?? "Add capital program"}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[820px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                {initial ? "Edit capital program" : "New capital program"}
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                {PROGRAM_TYPES.find((p) => p.value === type)?.label}
              </span>
            </header>

            <section className="grid grid-cols-3 gap-3">
              <Field label="Program name" hint="e.g. Gallantree CRE CLO 2026-1">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Type">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as ProgramPayload["type"])}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  {PROGRAM_TYPES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Deal size $" hint="total notes issued">
                <input
                  value={dealSize}
                  onChange={(e) => setDealSize(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Face value / note" hint="typical $1,000">
                <input
                  value={faceValuePerNote}
                  onChange={(e) => setFaceValuePerNote(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <NotesCount dealSize={dealSize} faceValue={faceValuePerNote} />
              <Field label="Start" hint="YYYY-MM">
                <input
                  value={startPeriodKey}
                  onChange={(e) => setStartPeriodKey(e.target.value)}
                  required
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>
              <Field label="End" hint="optional">
                <input
                  value={endPeriodKey}
                  onChange={(e) => setEndPeriodKey(e.target.value)}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>
              <Field label="Notes" hint="optional">
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Fee streams
                </h3>
                <button
                  type="button"
                  onClick={addFee}
                  className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  + Add fee
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-zinc-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Fee name</th>
                      <th className="px-2 py-1 text-left font-medium">Category</th>
                      <th className="px-2 py-1 text-right font-medium">Basis $</th>
                      <th className="px-2 py-1 text-right font-medium">bps</th>
                      <th className="px-2 py-1 text-right font-medium">$/yr</th>
                      <th className="px-2 py-1 text-left font-medium">Account</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f, i) => {
                      const annual =
                        (Number(parseDecimalInput(f.basisAmount)) * (Number(f.feeBps) || 0)) /
                        10000;
                      return (
                        <tr key={f.rowKey} className="border-t border-zinc-100">
                          <td className="px-2 py-1">
                            <input
                              value={f.name}
                              onChange={(e) => updateFee(i, { name: e.target.value })}
                              className="w-full rounded border border-zinc-200 px-1.5 py-0.5"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <select
                              value={f.category}
                              onChange={(e) => {
                                const cat = e.target.value as ProgramFeePayload["category"];
                                const defaultAcct = FEE_CATEGORIES.find(
                                  (c) => c.value === cat,
                                )!.defaultAccount;
                                updateFee(i, { category: cat, accountCode: defaultAcct });
                              }}
                              className="w-full rounded border border-zinc-200 px-1.5 py-0.5"
                            >
                              {FEE_CATEGORIES.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={f.basisAmount}
                              onChange={(e) => updateFee(i, { basisAmount: e.target.value })}
                              inputMode="decimal"
                              className="w-full rounded border border-zinc-200 px-1.5 py-0.5 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              value={f.feeBps}
                              onChange={(e) =>
                                updateFee(i, { feeBps: Number(e.target.value) || 0 })
                              }
                              inputMode="decimal"
                              className="w-20 rounded border border-zinc-200 px-1.5 py-0.5 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-zinc-600">
                            {annual.toLocaleString("en-AU", {
                              style: "currency",
                              currency: "AUD",
                              maximumFractionDigits: 0,
                            })}
                          </td>
                          <td className="px-2 py-1">
                            <select
                              value={f.accountCode}
                              onChange={(e) => updateFee(i, { accountCode: e.target.value })}
                              className="w-full rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[11px]"
                            >
                              {Object.entries(ACCOUNT_LABEL).map(([code, label]) => (
                                <option key={code} value={code}>
                                  {label}
                                </option>
                              ))}
                              {/* user may want to route to a custom account */}
                              {expenseAccountsForOverride
                                .filter((a) => !(a.code in ACCOUNT_LABEL))
                                .map((a) => (
                                  <option key={a.code} value={a.code}>
                                    {a.code} — {a.name}
                                  </option>
                                ))}
                            </select>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <button
                              type="button"
                              onClick={() => removeFee(i)}
                              className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                              aria-label="Remove fee"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {fees.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-zinc-400">
                          No fee streams. Click + Add fee.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Liability streams
                  <span className="ml-2 font-normal text-zinc-400">
                    notes / tranches issued to investors
                  </span>
                </h3>
                <button
                  type="button"
                  onClick={addLiability}
                  className="rounded-md border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  + Add liability
                </button>
              </div>
              <div className="overflow-hidden rounded-md border border-zinc-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="px-2 py-1 text-left font-medium">Tranche</th>
                      <th className="px-2 py-1 text-right font-medium"># notes</th>
                      <th className="px-2 py-1 text-right font-medium">Spread (bps)</th>
                      <th className="px-2 py-1 text-left font-medium">Calc</th>
                      <th className="px-2 py-1 text-left font-medium">Rate</th>
                      <th className="px-2 py-1 text-right font-medium">$ / yr</th>
                      <th className="px-2 py-1 text-right font-medium">$ / mo</th>
                      <th className="px-2 py-1 text-left font-medium">Account</th>
                      <th className="px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {liabilities.map((l, i) => (
                      <tr key={l.rowKey} className="border-t border-zinc-100">
                        <td className="px-2 py-1">
                          <input
                            value={l.name}
                            onChange={(e) => updateLiability(i, { name: e.target.value })}
                            placeholder="AAA / Mezz / Equity"
                            className="w-full rounded border border-zinc-200 px-1.5 py-0.5"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={l.numNotes ?? ""}
                            onChange={(e) =>
                              updateLiability(i, {
                                numNotes: e.target.value ? Number(e.target.value) : undefined,
                              })
                            }
                            inputMode="numeric"
                            className="w-20 rounded border border-zinc-200 px-1.5 py-0.5 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            value={l.returnProfileBps}
                            onChange={(e) =>
                              updateLiability(i, {
                                returnProfileBps: Number(e.target.value) || 0,
                              })
                            }
                            inputMode="decimal"
                            className="w-20 rounded border border-zinc-200 px-1.5 py-0.5 text-right tabular-nums"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={l.calculationMethod}
                            onChange={(e) =>
                              updateLiability(i, {
                                calculationMethod: e.target
                                  .value as ProgramLiabilityPayload["calculationMethod"],
                              })
                            }
                            className="w-full rounded border border-zinc-200 px-1.5 py-0.5"
                          >
                            {CALC_METHODS.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={l.rateType}
                            onChange={(e) =>
                              updateLiability(i, {
                                rateType: e.target.value as ProgramLiabilityPayload["rateType"],
                              })
                            }
                            className="w-full rounded border border-zinc-200 px-1.5 py-0.5"
                          >
                            <option value="fixed">Fixed</option>
                            <option value="variable">Variable (+ base rate)</option>
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-emerald-700">
                          {(() => {
                            const principal =
                              (l.numNotes ?? 0) *
                              Number(parseDecimalInput(faceValuePerNote || "0"));
                            const rateBps =
                              l.rateType === "variable"
                                ? baseRateBps + (l.returnProfileBps || 0)
                                : l.returnProfileBps || 0;
                            const annual = (principal * rateBps) / 10000;
                            if (!annual) return <span className="text-zinc-300">—</span>;
                            return annual.toLocaleString("en-AU", {
                              style: "currency",
                              currency: "AUD",
                              maximumFractionDigits: 0,
                            });
                          })()}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-zinc-600">
                          {(() => {
                            const principal =
                              (l.numNotes ?? 0) *
                              Number(parseDecimalInput(faceValuePerNote || "0"));
                            const rateBps =
                              l.rateType === "variable"
                                ? baseRateBps + (l.returnProfileBps || 0)
                                : l.returnProfileBps || 0;
                            const monthly = (principal * rateBps) / 10000 / 12;
                            if (!monthly) return <span className="text-zinc-300">—</span>;
                            return monthly.toLocaleString("en-AU", {
                              style: "currency",
                              currency: "AUD",
                              maximumFractionDigits: 0,
                            });
                          })()}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={l.accountCode ?? "6800"}
                            onChange={(e) => updateLiability(i, { accountCode: e.target.value })}
                            className="w-full rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[11px]"
                          >
                            {LIABILITY_ACCOUNTS.map((a) => (
                              <option key={a.code} value={a.code}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            type="button"
                            onClick={() => removeLiability(i)}
                            className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Remove liability"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                    {liabilities.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-2 py-3 text-center text-zinc-400">
                          No liability streams. Click + Add liability to model AAA / Mezz / Equity
                          tranches.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hide}
                disabled={pending}
                className="rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={pending || !name.trim()}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : (saveLabel ?? (initial ? "Save changes" : "Create program"))}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function NotesCount({ dealSize, faceValue }: { dealSize: string; faceValue: string }) {
  const d = Number(parseDecimalInput(dealSize));
  const f = Number(parseDecimalInput(faceValue));
  const notes = f > 0 ? d / f : null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        Number of notes <span className="ml-1 font-normal lowercase text-zinc-400">· computed</span>
      </span>
      <div className="flex h-[34px] items-center justify-end rounded-md border border-dashed border-zinc-300 bg-zinc-50 px-2 text-right tabular-nums text-zinc-700">
        {notes === null || !Number.isFinite(notes) ? (
          <span className="text-zinc-400">—</span>
        ) : (
          notes.toLocaleString("en-AU", { maximumFractionDigits: 0 })
        )}
      </div>
    </div>
  );
}
