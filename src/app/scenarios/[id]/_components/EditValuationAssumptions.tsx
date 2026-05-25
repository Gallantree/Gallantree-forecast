"use client";

import { useRef, useState, useTransition } from "react";
import type { ValuationAssumptionsPayload } from "../_actions";

export interface ValuationAssumptionsView {
  waccPct: string;
  terminalGrowthPct: string;
  evEbitdaMultiple: string;
  evRevenueMultiple: string;
  peMultiple: string;
  netDebt: string;
  pbMultiple: string;
}

export function EditValuationAssumptions({
  initial,
  saveAction,
}: {
  initial: ValuationAssumptionsView;
  saveAction: (payload: ValuationAssumptionsPayload) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [waccPct, setWaccPct] = useState(initial.waccPct);
  const [terminalGrowthPct, setTerminalGrowthPct] = useState(initial.terminalGrowthPct);
  const [evEbitdaMultiple, setEvEbitdaMultiple] = useState(initial.evEbitdaMultiple);
  const [evRevenueMultiple, setEvRevenueMultiple] = useState(initial.evRevenueMultiple);
  const [peMultiple, setPeMultiple] = useState(initial.peMultiple);
  const [netDebt, setNetDebt] = useState(initial.netDebt);
  const [pbMultiple, setPbMultiple] = useState(initial.pbMultiple);

  function show() {
    setWaccPct(initial.waccPct);
    setTerminalGrowthPct(initial.terminalGrowthPct);
    setEvEbitdaMultiple(initial.evEbitdaMultiple);
    setEvRevenueMultiple(initial.evRevenueMultiple);
    setPeMultiple(initial.peMultiple);
    setNetDebt(initial.netDebt);
    setPbMultiple(initial.pbMultiple);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }
  function save() {
    startTransition(async () => {
      await saveAction({
        waccPct,
        terminalGrowthPct,
        evEbitdaMultiple,
        evRevenueMultiple,
        peMultiple,
        netDebt,
        pbMultiple,
      });
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Edit assumptions
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[560px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Valuation assumptions</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                applies to all methods
              </span>
            </header>

            <div className="grid grid-cols-2 gap-3">
              <Field label="WACC %" hint="discount rate; default 12">
                <input
                  value={waccPct}
                  onChange={(e) => setWaccPct(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Terminal growth %" hint="Gordon growth; default 2.5">
                <input
                  value={terminalGrowthPct}
                  onChange={(e) => setTerminalGrowthPct(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="EV / EBITDA multiple" hint="default 10x">
                <input
                  value={evEbitdaMultiple}
                  onChange={(e) => setEvEbitdaMultiple(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="EV / Revenue multiple" hint="default 4x">
                <input
                  value={evRevenueMultiple}
                  onChange={(e) => setEvRevenueMultiple(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="P / E multiple" hint="default 15x">
                <input
                  value={peMultiple}
                  onChange={(e) => setPeMultiple(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="Net debt $" hint="EV − net debt = equity">
                <input
                  value={netDebt}
                  onChange={(e) => setNetDebt(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="P/B multiple" hint="default 1.4x">
                <input
                  value={pbMultiple}
                  onChange={(e) => setPbMultiple(e.target.value)}
                  inputMode="decimal"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
            </div>

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
                onClick={save}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
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
