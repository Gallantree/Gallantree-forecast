"use client";

import { useRef, useState, useTransition } from "react";
import type { LiabilityTranchePayload } from "../../../_actions";

export interface LiabilityEditInitial {
  _id: string;
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: "monthly" | "quarterly" | "annually";
  rateType: "fixed" | "variable";
  accountCode?: string;
}

export function LiabilityRowActions({
  initial,
  updateAction,
}: {
  initial: LiabilityEditInitial;
  updateAction: (payload: LiabilityTranchePayload) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(initial.name);
  const [numNotes, setNumNotes] = useState(
    initial.numNotes !== undefined ? String(initial.numNotes) : "",
  );
  const [returnProfileBps, setReturnProfileBps] = useState(String(initial.returnProfileBps));
  const [calculationMethod, setCalculationMethod] = useState(initial.calculationMethod);
  const [rateType, setRateType] = useState(initial.rateType);
  const [accountCode, setAccountCode] = useState(initial.accountCode ?? "");

  function showEdit() {
    setMenuOpen(false);
    setEditOpen(true);
    editRef.current?.showModal();
  }
  function hideEdit() {
    editRef.current?.close();
    setEditOpen(false);
  }

  function onSave() {
    const payload: LiabilityTranchePayload = {
      name: name.trim(),
      numNotes: numNotes ? Number(numNotes) : undefined,
      returnProfileBps: Number(returnProfileBps) || 0,
      calculationMethod,
      rateType,
      accountCode: accountCode.trim() || undefined,
    };
    startTransition(async () => {
      await updateAction(payload);
      hideEdit();
    });
  }

  return (
    <>
      <details
        open={menuOpen}
        onToggle={(e) => setMenuOpen((e.target as HTMLDetailsElement).open)}
        className="relative inline-block"
      >
        <summary
          aria-label="Row actions"
          className="flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 [&::-webkit-details-marker]:hidden"
          style={{ listStyle: "none" }}
        >
          <span className="text-base leading-none">⋮</span>
        </summary>
        <div className="absolute right-0 top-full z-30 mt-1 w-32 overflow-hidden rounded-md border border-zinc-200 bg-white text-xs shadow-lg">
          <button
            type="button"
            onClick={showEdit}
            className="block w-full px-3 py-1.5 text-left hover:bg-zinc-100"
          >
            Edit
          </button>
        </div>
      </details>

      <dialog
        ref={editRef}
        onClose={() => setEditOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {editOpen && (
          <div className="flex w-[560px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Edit tranche · {initial.name}</h2>
              <span className="font-mono text-[10px] text-zinc-400">{initial._id}</span>
            </header>

            <section className="grid grid-cols-2 gap-3">
              <Field label="Tranche name" className="col-span-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="rounded-md border border-zinc-300 px-2 py-1"
                />
              </Field>

              <Field label="# Notes">
                <input
                  value={numNotes}
                  onChange={(e) => setNumNotes(e.target.value)}
                  inputMode="numeric"
                  placeholder="e.g. 547021"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="Spread (bps)">
                <input
                  value={returnProfileBps}
                  onChange={(e) => setReturnProfileBps(e.target.value)}
                  inputMode="numeric"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>

              <Field label="Calculation">
                <select
                  value={calculationMethod}
                  onChange={(e) =>
                    setCalculationMethod(e.target.value as "monthly" | "quarterly" | "annually")
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </Field>

              <Field label="Rate type">
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as "fixed" | "variable")}
                  className="rounded-md border border-zinc-300 px-2 py-1"
                >
                  <option value="variable">Variable + base</option>
                  <option value="fixed">Fixed</option>
                </select>
              </Field>

              <Field label="Account code" className="col-span-2">
                <input
                  value={accountCode}
                  onChange={(e) => setAccountCode(e.target.value)}
                  placeholder="e.g. 6800"
                  className="rounded-md border border-zinc-300 px-2 py-1 font-mono"
                />
              </Field>
            </section>

            <footer className="flex justify-end gap-2 border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hideEdit}
                disabled={pending}
                className="rounded-md px-3 py-1 text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save changes"}
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
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
