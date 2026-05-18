"use client";

import { useRef, useState, useTransition } from "react";
import { parseDecimalInput } from "@/utils/format";
import type { OpexDriverPayload } from "../_actions";

export type OpexDriverType = "opex_fixed" | "opex_pct_revenue" | "opex_per_fte";

export interface OpexDriverFormInitial {
  type: OpexDriverType;
  name: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  baseMonthly?: string;
  monthlyGrowthPct?: string;
  pctOfRevenue?: string;
  costPerFteMonthly?: string;
}

const TYPE_LABEL: Record<OpexDriverType, string> = {
  opex_fixed: "Fixed $/month",
  opex_pct_revenue: "% of revenue",
  opex_per_fte: "Per FTE / month",
};

export function AddOpexDriverModal({
  defaultStartPeriod,
  expenseAccounts,
  initial,
  saveAction,
  triggerLabel,
  triggerClassName,
}: {
  defaultStartPeriod: string;
  expenseAccounts: { code: string; name: string }[];
  initial?: OpexDriverFormInitial;
  saveAction: (payload: OpexDriverPayload) => Promise<void>;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed: OpexDriverFormInitial = initial ?? {
    type: "opex_fixed",
    name: "",
    accountCode: "",
    startPeriodKey: defaultStartPeriod,
    baseMonthly: "0",
    monthlyGrowthPct: "0",
  };

  const [type, setType] = useState<OpexDriverType>(seed.type);
  const [name, setName] = useState(seed.name);
  const [accountCode, setAccountCode] = useState(seed.accountCode);
  const [startPeriodKey, setStartPeriodKey] = useState(seed.startPeriodKey);
  const [endPeriodKey, setEndPeriodKey] = useState(seed.endPeriodKey ?? "");
  const [baseMonthly, setBaseMonthly] = useState(seed.baseMonthly ?? "0");
  const [monthlyGrowthPct, setMonthlyGrowthPct] = useState(seed.monthlyGrowthPct ?? "0");
  const [pctOfRevenue, setPctOfRevenue] = useState(seed.pctOfRevenue ?? "0");
  const [costPerFteMonthly, setCostPerFteMonthly] = useState(seed.costPerFteMonthly ?? "0");

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onSave() {
    if (!name.trim() || !accountCode) return;
    let payload: OpexDriverPayload;
    if (type === "opex_fixed") {
      payload = {
        type: "opex_fixed",
        name: name.trim(),
        accountCode,
        startPeriodKey,
        endPeriodKey: endPeriodKey.trim() || undefined,
        baseMonthly: parseDecimalInput(baseMonthly),
        monthlyGrowthPct: parseDecimalInput(monthlyGrowthPct),
      };
    } else if (type === "opex_pct_revenue") {
      payload = {
        type: "opex_pct_revenue",
        name: name.trim(),
        accountCode,
        startPeriodKey,
        endPeriodKey: endPeriodKey.trim() || undefined,
        pctOfRevenue: parseDecimalInput(pctOfRevenue),
      };
    } else {
      payload = {
        type: "opex_per_fte",
        name: name.trim(),
        accountCode,
        startPeriodKey,
        endPeriodKey: endPeriodKey.trim() || undefined,
        costPerFteMonthly: parseDecimalInput(costPerFteMonthly),
      };
    }
    startTransition(async () => {
      await saveAction(payload);
      hide();
    });
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={show}
        className={
          triggerClassName ??
          "whitespace-nowrap rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        }
      >
        {triggerLabel ?? "Add OPEX driver"}
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[600px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">
                {initial ? "Edit OPEX driver" : "New OPEX driver"}
              </h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                {TYPE_LABEL[type]}
              </span>
            </header>

            <section className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Driver name" hint="e.g. Brisbane Rent, Slack subscription">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>
              <Field label="Type">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as OpexDriverType)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="opex_fixed">Fixed $/month</option>
                  <option value="opex_pct_revenue">% of revenue</option>
                  <option value="opex_per_fte">Per FTE / month</option>
                </select>
              </Field>

              <Field label="OPEX account" hint="cost centre">
                <select
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  required
                  className="w-full rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {expenseAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Start" hint="YYYY-MM">
                <input
                  value={startPeriodKey}
                  onChange={(e) => setStartPeriodKey(e.target.value)}
                  required
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>

              <Field label="End" hint="optional">
                <input
                  value={endPeriodKey}
                  onChange={(e) => setEndPeriodKey(e.target.value)}
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1 text-center font-mono"
                />
              </Field>
              <div />
            </section>

            <section className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-zinc-50/50 p-3 text-xs">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                {TYPE_LABEL[type]} parameters
              </div>
              {type === "opex_fixed" && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Base $/month">
                    <input
                      value={baseMonthly}
                      onChange={(e) => setBaseMonthly(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                  <Field label="Growth % / month" hint="compounds monthly">
                    <input
                      value={monthlyGrowthPct}
                      onChange={(e) => setMonthlyGrowthPct(e.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </Field>
                </div>
              )}
              {type === "opex_pct_revenue" && (
                <Field label="% of revenue" hint="applied to total revenue each month">
                  <input
                    value={pctOfRevenue}
                    onChange={(e) => setPctOfRevenue(e.target.value)}
                    inputMode="decimal"
                    className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                  />
                </Field>
              )}
              {type === "opex_per_fte" && (
                <Field label="Cost per FTE / month" hint="scales with active FTE count">
                  <input
                    value={costPerFteMonthly}
                    onChange={(e) => setCostPerFteMonthly(e.target.value)}
                    inputMode="decimal"
                    className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                  />
                </Field>
              )}
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
                onClick={onSave}
                disabled={pending || !name.trim() || !accountCode}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : initial ? "Save changes" : "Create driver"}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
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
