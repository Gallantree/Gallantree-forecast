"use client";

import { useRef, useState, useTransition } from "react";
import { updateWorkingCapitalDays } from "../_actions";

export function EditWorkingCapitalModal({
  scenarioId,
  initialDso,
  initialDpo,
}: {
  scenarioId: string;
  initialDso: string;
  initialDpo: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [dso, setDso] = useState(initialDso);
  const [dpo, setDpo] = useState(initialDpo);

  function show() {
    setDso(initialDso);
    setDpo(initialDpo);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }
  function save() {
    startTransition(async () => {
      await updateWorkingCapitalDays(scenarioId, { dsoDays: dso, dpoDays: dpo });
      hide();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
      >
        Edit
      </button>
      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[440px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Working capital days</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">DSO / DPO</span>
            </header>
            <p className="text-[11px] text-zinc-500">
              DSO scales accounts receivable as{" "}
              <span className="font-mono">revenue × (DSO / 30)</span>; DPO scales accounts payable
              from cash opex. Use 0 for revenue billed upfront.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DSO (days)" hint="receivables collection lag">
                <input
                  value={dso}
                  onChange={(e) => setDso(e.target.value)}
                  inputMode="decimal"
                  autoFocus
                  className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </Field>
              <Field label="DPO (days)" hint="payables payment lag">
                <input
                  value={dpo}
                  onChange={(e) => setDpo(e.target.value)}
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
