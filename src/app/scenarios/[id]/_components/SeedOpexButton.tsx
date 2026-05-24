"use client";

import { useRef, useState, useTransition } from "react";
import { seedGallantreeOpex } from "../_actions";

export function SeedOpexButton({ scenarioId }: { scenarioId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);

  function show() {
    setOpen(true);
    dialogRef.current?.showModal();
  }
  function hide() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function confirmSeed() {
    startTransition(async () => {
      const res = await seedGallantreeOpex(scenarioId);
      hide();
      if (res.ok) {
        setToast({ msg: `Seeded ${res.created} OPEX driver(s).`, tone: "ok" });
        setTimeout(() => setToast(null), 4000);
      } else {
        setToast({ msg: `Seed failed: ${res.error ?? "unknown error"}`, tone: "warn" });
        setTimeout(() => setToast(null), 8000);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        disabled={pending}
        title="Seed the standard Gallantree OPEX drivers (rent, utilities, insurance, software, hosting, AI, travel, etc.) starting Jan 2026."
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
      >
        {pending ? "Seeding OPEX…" : "Seed Gallantree OPEX"}
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto h-fit max-h-[90vh] w-fit max-w-[95vw] rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      >
        {open && (
          <div className="flex w-[480px] flex-col gap-4 p-6 text-sm">
            <header className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Seed Gallantree OPEX</h2>
              <span className="text-[10px] uppercase tracking-wider text-zinc-400">
                Standard OPEX drivers
              </span>
            </header>
            <div className="space-y-3 text-zinc-700">
              <p>
                Adds the recurring OPEX line items below starting{" "}
                <span className="font-medium text-zinc-900">Jan 2026</span>:
              </p>
              <ul className="ml-4 list-disc space-y-0.5 text-zinc-600">
                <li>Office rent ($12k/mo, 3% p.a. CPI) + Utilities ($400/mo)</li>
                <li>Insurance — P&amp;I ($500/mo) and D&amp;O ($1.2k/mo)</li>
                <li>Travel ($1.2k Q1; $3k/mo from Apr, 8%/qtr growth)</li>
                <li>Software ($800/FTE/mo, 5%/qtr) + Hosting ($1.8k) + Mailchimp ($50)</li>
                <li>Claude & AI ($2k/mo) + AI tokens ($200/mo from Apr, 5%/qtr)</li>
                <li>Credit checks ($1.8k/mo) + Accounting ($500) + Legal ($800)</li>
                <li>Audit — $36k one-off every September (5 occurrences)</li>
              </ul>
              <p className="text-[11px] text-zinc-500">
                Existing drivers are kept — re-seeding will create duplicates. Clear OPEX drivers
                first if you&apos;ve already seeded.
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
                {pending ? "Seeding…" : "Seed OPEX drivers"}
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
