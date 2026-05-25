"use client";

import { useRef, useState, useTransition } from "react";
import { fmtMoney2 } from "@/utils/format";
import type { CapexDriverPayload } from "../_actions";

const USEFUL_LIFE_PRESET: Record<string, number> = {
  "6700": 36,
  "6710": 60,
  "6720": 60,
  "6730": 84,
  "6740": 120,
  "6750": 60,
  "6760": 60,
  "6770": 36,
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function AddCapexModal({
  defaultStartPeriod,
  expenseAccounts,
  saveAction,
}: {
  defaultStartPeriod: string;
  expenseAccounts: { code: string; name: string }[];
  saveAction: (payload: CapexDriverPayload) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const depAccounts = expenseAccounts.filter(
    (a) => Number(a.code) >= 6700 && Number(a.code) <= 6799,
  );

  const defaultAccount =
    depAccounts.find((a) => a.code === "6700")?.code ?? depAccounts[0]?.code ?? "";

  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState(defaultAccount);
  const [inServicePeriodKey, setInServicePeriodKey] = useState(defaultStartPeriod);
  const [cost, setCost] = useState("");
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(
    String(USEFUL_LIFE_PRESET[defaultAccount] ?? 36),
  );

  function handleAccountChange(code: string) {
    setAccountCode(code);
    const preset = USEFUL_LIFE_PRESET[code];
    if (preset) setUsefulLifeMonths(String(preset));
  }

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }

  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function reset() {
    setName("");
    setAccountCode(defaultAccount);
    setInServicePeriodKey(defaultStartPeriod);
    setCost("");
    setUsefulLifeMonths(String(USEFUL_LIFE_PRESET[defaultAccount] ?? 36));
  }

  const costNum = Number(cost);
  const lifeNum = Number(usefulLifeMonths);
  const depPerMonth =
    Number.isFinite(costNum) && costNum > 0 && lifeNum > 0 ? costNum / lifeNum : null;

  const isValid =
    name.trim().length > 0 &&
    accountCode.length > 0 &&
    PERIOD_RE.test(inServicePeriodKey) &&
    Number.isFinite(costNum) &&
    costNum > 0 &&
    lifeNum >= 1;

  function onSave() {
    if (!isValid) return;
    startTransition(async () => {
      await saveAction({
        name: name.trim(),
        accountCode,
        inServicePeriodKey,
        cost,
        usefulLifeMonths: Math.floor(lifeNum),
      });
      reset();
      hide();
    });
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={show}
        className="whitespace-nowrap rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
      >
        Add asset
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[520px] flex-col gap-5 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Add capex asset</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                Straight-line depreciation
              </span>
            </header>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <Field label="Asset name" hint="e.g. MacBook Pros (×5)" className="col-span-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Office fit-out, servers batch 1"
                  autoFocus
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                />
              </Field>

              <Field label="Depreciation account" hint="cost centre" className="col-span-2">
                <select
                  value={accountCode}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                >
                  <option value="" disabled>
                    Select account…
                  </option>
                  {depAccounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="In-service date" hint="cash outflow month (YYYY-MM)">
                <input
                  value={inServicePeriodKey}
                  onChange={(e) => setInServicePeriodKey(e.target.value)}
                  placeholder="YYYY-MM"
                  pattern="\d{4}-(0[1-9]|1[0-2])"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 font-mono"
                />
              </Field>

              <Field label="Total cost ($)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
                />
              </Field>

              <Field label="Useful life (months)" hint="straight-line over this period">
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={usefulLifeMonths}
                  onChange={(e) => setUsefulLifeMonths(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-right tabular-nums"
                />
              </Field>

              <Field label="Dep / month" hint="computed">
                <div className="flex h-[30px] items-center justify-end rounded-md border border-zinc-200 bg-zinc-50 px-2 tabular-nums text-zinc-700">
                  {depPerMonth != null ? fmtMoney2(depPerMonth.toFixed(2)) : "—"}
                </div>
              </Field>
            </div>

            {/* Useful-life hint */}
            <p className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
              <span className="font-medium text-zinc-700">Defaults by category —</span> IT
              equipment: 36 mo · Software: 60 mo · Servers: 60 mo · Furniture: 84 mo · Leasehold:
              120 mo · Vehicles: 60 mo · Lab equipment: 60 mo · ROU assets: 36 mo
            </p>

            <footer className="flex items-center justify-between border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={() => {
                  reset();
                  hide();
                }}
                disabled={pending}
                className="rounded-md px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending || !isValid}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add asset"}
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
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
        {hint ? <span className="ml-1 font-normal lowercase text-zinc-400">· {hint}</span> : null}
      </span>
      {children}
    </label>
  );
}
