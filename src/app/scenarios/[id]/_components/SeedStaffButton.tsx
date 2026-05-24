"use client";

import { useRef, useState, useTransition } from "react";
import { seedGallantreeStaff } from "../_actions";

export function SeedStaffButton({ scenarioId }: { scenarioId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);
  const [bumpBands, setBumpBands] = useState(2);

  function show() {
    setBumpBands(2);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function confirmSeed() {
    const safe = Math.max(0, Math.min(10, Math.floor(bumpBands)));
    startTransition(async () => {
      const res = await seedGallantreeStaff(scenarioId, { bumpBands: safe });
      hide();
      if (res.ok) {
        setToast({ msg: `Seeded ${res.created} staff records.`, tone: "ok" });
        setTimeout(() => setToast(null), 4000);
      } else {
        setToast({ msg: `Seed failed: ${res.error ?? "unknown error"}`, tone: "warn" });
        setTimeout(() => setToast(null), 8000);
      }
    });
  }

  const clamped = Math.max(0, Math.min(10, Math.floor(bumpBands)));
  const willBump = clamped > 0;
  const rowsPerPerson = willBump ? 2 : 1;

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={pending}
        title="Seed all current Gallantree staff (from gallantree.com.au/team) starting Jan 2026 with suggested paybands."
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Seeding staff…" : "Seed Gallantree staff"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[520px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Seed Gallantree staff</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                from gallantree.com.au/team
              </span>
            </header>

            <p className="text-zinc-700">
              Adds <span className="font-semibold">17 people</span> to this scenario.
            </p>

            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="flex items-center gap-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Bump paybands on
                </span>
                <span className="font-mono text-xs text-zinc-700">2026-08</span>
                <span className="flex-1" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Bands up
                </span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={bumpBands}
                  onChange={(e) => setBumpBands(Number(e.target.value))}
                  className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
              </label>
              <p className="mt-2 text-[11px] text-zinc-500">
                {clamped === 0
                  ? "0 = no bump. Everyone stays on their current pin (one row per person, open-ended)."
                  : `Phase 2 band = max(1, current band − ${clamped}), same tier. Salary hydrates from the payband grid.`}{" "}
                Examples: B9/T3 → {willBump ? `B${Math.max(1, 9 - clamped)}/T3` : "B9/T3"}; B8/T2 →{" "}
                {willBump ? `B${Math.max(1, 8 - clamped)}/T2` : "B8/T2"}.
              </p>
            </div>

            <div className="space-y-2 text-zinc-700">
              {willBump ? (
                <>
                  <p>Each person gets two phase rows:</p>
                  <ul className="ml-4 list-disc space-y-1 text-zinc-600">
                    <li>
                      <span className="font-medium text-zinc-800">Phase 1</span> — current salary,
                      Jan 2026 → Jul 2026 (band/tier pinned to the closest grid cell).
                    </li>
                    <li>
                      <span className="font-medium text-zinc-800">Phase 2</span> — bumped up{" "}
                      {clamped} payband{clamped === 1 ? "" : "s"} at the same tier from Aug 2026
                      onwards; salary hydrates from the grid.
                    </li>
                  </ul>
                </>
              ) : (
                <p>
                  Each person gets <span className="font-medium">one row</span> carrying their
                  current salary, running open-ended from Jan 2026.
                </p>
              )}
              <p className="text-[11px] text-zinc-500">
                Advisors are excluded. Existing staff rows are kept — to avoid duplicates, wipe
                staff first (Control panel → Wipe scenario data) or delete any prior seed rows.
              </p>
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
                onClick={confirmSeed}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1 font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending
                  ? "Seeding…"
                  : `Seed 17 staff (${17 * rowsPerPerson} row${rowsPerPerson === 1 ? "" : "s"})`}
              </button>
            </footer>
          </div>
        )}
      </dialog>

      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 rounded-md px-4 py-2 text-xs font-medium shadow-lg ${
            toast.tone === "warn"
              ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </>
  );
}
