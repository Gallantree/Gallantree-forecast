"use client";

import { useRef, useState, useTransition } from "react";
import { updateOpeningCash } from "../_actions";

export function EditOpeningCashModal({
  scenarioId,
  initial,
}: {
  scenarioId: string;
  initial: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(initial);

  function show() {
    setValue(initial);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }
  function save() {
    startTransition(async () => {
      await updateOpeningCash(scenarioId, value);
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
          <div className="flex w-[420px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Opening cash</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                FY-start balance
              </span>
            </header>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Amount ($)
              </span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                autoFocus
                className="rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
              />
              <span className="text-[10px] text-zinc-400">
                Commas allowed (e.g. 1,500,000). Saved as a Decimal value.
              </span>
            </label>
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
