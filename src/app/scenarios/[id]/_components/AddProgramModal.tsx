"use client";

import { useRef, useState, useTransition } from "react";
import { parseDecimalInput } from "@/utils/format";
import type { ProgramPayload, ProgramFeePayload } from "../_actions";

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
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: ProgramFeePayload[];
};

function defaultInitial(startPeriod: string): ProgramFormInitial {
  return {
    name: "",
    type: "CRE_CLO",
    dealSize: "",
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
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = initial ?? defaultInitial(defaultStartPeriod);
  const [name, setName] = useState(seed.name);
  const [type, setType] = useState<ProgramPayload["type"]>(seed.type);
  const [dealSize, setDealSize] = useState(seed.dealSize ?? "");
  const [startPeriodKey, setStartPeriodKey] = useState(seed.startPeriodKey);
  const [endPeriodKey, setEndPeriodKey] = useState(seed.endPeriodKey ?? "");
  const [notes, setNotes] = useState(seed.notes ?? "");
  const [fees, setFees] = useState<FeeRow[]>(
    initial
      ? initial.fees.map((f) => ({ rowKey: crypto.randomUUID(), ...f }))
      : defaultFeeRows(),
  );

  function reset() {
    const s = initial ?? defaultInitial(defaultStartPeriod);
    setName(s.name);
    setType(s.type);
    setDealSize(s.dealSize ?? "");
    setStartPeriodKey(s.startPeriodKey);
    setEndPeriodKey(s.endPeriodKey ?? "");
    setNotes(s.notes ?? "");
    setFees(
      initial
        ? s.fees.map((f) => ({ rowKey: crypto.randomUUID(), ...f }))
        : defaultFeeRows(),
    );
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
      startPeriodKey,
      endPeriodKey: endPeriodKey.trim() || undefined,
      notes: notes.trim() || undefined,
      fees: fees.map(({ rowKey: _rk, ...f }) => {
        void _rk;
        return f;
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
        className="rounded-lg p-0 backdrop:bg-black/30"
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
              <Field label="Deal size $" hint="informational; total notes issued">
                <input
                  value={dealSize}
                  onChange={(e) => setDealSize(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
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
                        Number(parseDecimalInput(f.basisAmount)) * (Number(f.feeBps) || 0) / 10000;
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
                                const defaultAcct = FEE_CATEGORIES.find((c) => c.value === cat)!
                                  .defaultAccount;
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
                        <td
                          colSpan={7}
                          className="px-2 py-3 text-center text-zinc-400"
                        >
                          No fee streams. Click + Add fee.
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
