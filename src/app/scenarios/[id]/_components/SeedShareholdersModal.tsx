"use client";

import { useRef, useState, useTransition } from "react";
import { SHAREHOLDER_SEED } from "@/seed/shareholders";

const CLASS_BADGE: Record<string, string> = {
  "Founder Shares": "bg-violet-100 text-violet-800",
  Ordinary: "bg-blue-100 text-blue-700",
  Preference: "bg-emerald-100 text-emerald-700",
};

function fmt(n: number) {
  return n.toLocaleString("en-AU");
}

const totalShares = SHAREHOLDER_SEED.reduce((s, r) => s + r.shares, 0);
const totalPaidIn = SHAREHOLDER_SEED.reduce((s, r) => s + r.shares * Number(r.pricePerShare), 0);

export function SeedShareholdersModal({
  existingCount,
  saveAction,
}: {
  existingCount: number;
  saveAction: () => Promise<{ inserted: number }>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function show() {
    setResult(null);
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function onSeed() {
    startTransition(async () => {
      const r = await saveAction();
      setResult(`Done — ${r.inserted} shareholders added.`);
      setTimeout(hide, 1500);
    });
  }

  return (
    <div className="inline-flex">
      <button
        type="button"
        onClick={show}
        className="whitespace-nowrap rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Seed shareholders
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] overflow-y-auto rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[700px] flex-col gap-4 p-6 text-sm">
            <header>
              <h2 className="text-base font-semibold">Seed shareholders</h2>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Imports the full Gallantree Group Pty Ltd share register (ACN 644 812 617) as at 25
                May 2026.
              </p>
            </header>

            {existingCount > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                This scenario already has <span className="font-semibold">{existingCount}</span>{" "}
                shareholder{existingCount !== 1 ? "s" : ""}. Seeding will add{" "}
                <span className="font-semibold">{SHAREHOLDER_SEED.length}</span> more — existing
                entries will not be removed.
              </div>
            )}

            {/* Summary strip */}
            <div className="grid grid-cols-3 divide-x divide-zinc-200 rounded-md border border-zinc-200 bg-zinc-50 text-xs">
              <div className="px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Shareholders
                </div>
                <div className="mt-0.5 font-semibold text-zinc-900">{SHAREHOLDER_SEED.length}</div>
              </div>
              <div className="px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Total shares
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
                  {fmt(totalShares)}
                </div>
              </div>
              <div className="px-4 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Total paid-in
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-zinc-900">
                  $
                  {totalPaidIn.toLocaleString("en-AU", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {/* Preview table */}
            <div className="max-h-[400px] overflow-y-auto rounded-md border border-zinc-200">
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 bg-zinc-50">
                  <tr className="border-b border-zinc-200">
                    <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">
                      Name
                    </th>
                    <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">
                      Entity / Trust
                    </th>
                    <th className="px-3 py-1.5 text-center font-semibold uppercase tracking-wider text-zinc-500">
                      Held
                    </th>
                    <th className="px-3 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">
                      Class
                    </th>
                    <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                      Shares
                    </th>
                    <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                      % Hold
                    </th>
                    <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                      Issue $
                    </th>
                    <th className="px-3 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                      Date
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {SHAREHOLDER_SEED.map((r, i) => {
                    const pct = (r.shares / totalShares) * 100;
                    return (
                      <tr key={i} className="hover:bg-zinc-50">
                        <td className="px-3 py-1.5 font-medium text-zinc-900">{r.name}</td>
                        <td className="max-w-[160px] truncate px-3 py-1.5 text-zinc-500">
                          {r.entityTrust ?? <span className="italic text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              r.beneficiallyHeld
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-zinc-100 text-zinc-500"
                            }`}
                          >
                            {r.beneficiallyHeld ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              CLASS_BADGE[r.shareClass] ?? "bg-zinc-100 text-zinc-700"
                            }`}
                          >
                            {r.shareClass}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-800">
                          {fmt(r.shares)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                          {pct.toFixed(2)}%
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                          ${Number(r.pricePerShare).toFixed(3)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-zinc-500">
                          {r.dateOfIssue}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {result && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700">
                {result}
              </p>
            )}

            <footer className="flex items-center justify-between border-t border-zinc-200 pt-3">
              <button
                type="button"
                onClick={hide}
                disabled={pending}
                className="rounded-md px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSeed}
                disabled={pending}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
              >
                {pending ? "Seeding…" : `Seed ${SHAREHOLDER_SEED.length} shareholders →`}
              </button>
            </footer>
          </div>
        )}
      </dialog>
    </div>
  );
}
