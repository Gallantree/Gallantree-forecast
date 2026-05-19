"use client";

// One row per forecast FY. The user types the target END-OF-FY total
// headcount; the modal back-computes the delta vs. either today's actual
// (year 1) or the prior year's target (year 2+) and displays the "new
// hires" implied by each row. On save, the server action regenerates the
// underlying isGrowth=true Headcount placeholders so the cost flows
// naturally through the staffing engine.

import { useEffect, useMemo, useState, useTransition } from "react";
import { setStaffGrowthTargets } from "../_actions";

interface PlanStaffGrowthModalProps {
  scenarioId: string;
  // FY year numbers in horizon order, e.g. [2027, 2028, 2029, 2030, 2031].
  fys: number[];
  // Current actual head count (excluding existing growth placeholders).
  currentHeadcount: number;
  // Previously-saved targets, one per FY. May be undefined or shorter than
  // fys; missing entries default to the previous running total.
  savedTargets?: number[];
  triggerClassName?: string;
}

export function PlanStaffGrowthModal({
  scenarioId,
  fys,
  currentHeadcount,
  savedTargets,
  triggerClassName,
}: PlanStaffGrowthModalProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Initial values per row. Default each year's target to "prior running
  // total" (no growth) when no saved value exists — that way the form opens
  // showing a flat plan that the user can edit.
  const initial = useMemo(() => {
    return fys.map((_, i) => {
      const saved = savedTargets?.[i];
      if (saved !== undefined) return String(saved);
      // Walk backward to the most recent saved value, falling back to today.
      for (let j = i - 1; j >= 0; j -= 1) {
        const prior = savedTargets?.[j];
        if (prior !== undefined) return String(prior);
      }
      return String(currentHeadcount);
    });
  }, [fys, currentHeadcount, savedTargets]);

  const [targets, setTargets] = useState<string[]>(initial);

  // Re-sync when the modal opens so we always start from the latest saved
  // state (in case the user changed staff between opens).
  useEffect(() => {
    if (open) setTargets(initial);
  }, [open, initial]);

  // Lock body scroll + ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, pending]);

  // Derive the running deltas for the preview column. Express the running
  // total as a pure scan so the loop body has no reassignment — keeps
  // React 19's `react-hooks/refs` rule satisfied.
  const rows = useMemo(() => {
    return fys.map((fy, i) => {
      const target = Math.max(0, Math.floor(Number(targets[i]) || 0));
      const prior =
        i === 0 ? currentHeadcount : Math.max(0, Math.floor(Number(targets[i - 1]) || 0));
      const delta = target - prior;
      return { fy, target, prior, delta };
    });
  }, [fys, targets, currentHeadcount]);

  const totalNewHires = rows.reduce((acc, r) => acc + Math.max(0, r.delta), 0);
  const finalHeadcount = rows.length > 0 ? rows[rows.length - 1].target : currentHeadcount;

  function setTarget(i: number, value: string) {
    setTargets((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  function submit() {
    const payload = rows.map((r) => r.target);
    startTransition(async () => {
      await setStaffGrowthTargets(scenarioId, payload);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        }
      >
        Plan growth
      </button>

      {open ? (
        <>
          <div
            aria-hidden="true"
            onClick={() => !pending && setOpen(false)}
            className="fixed inset-0 z-[90] bg-zinc-900/40 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-staff-growth-title"
            className="fixed inset-0 z-[91] grid place-items-center p-4"
          >
            <div className="flex max-h-[88vh] w-full max-w-[640px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl">
              <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
                <div>
                  <h2
                    id="plan-staff-growth-title"
                    className="text-sm font-semibold tracking-tight text-zinc-900"
                  >
                    Plan staff growth
                  </h2>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    Set the target end-of-FY headcount per year. New hires needed each year are
                    created as placeholder roles that flow into the staffing cost projection.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Close"
                >
                  ×
                </button>
              </header>

              <div className="flex-1 overflow-auto px-5 py-4 text-xs">
                <div className="mb-2 grid grid-cols-[80px_1fr_1fr_1fr] items-center gap-3 border-b border-zinc-100 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                  <span>FY</span>
                  <span>Prior</span>
                  <span>Target EOY</span>
                  <span className="text-right">New hires</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {rows.map((r, i) => (
                    <div
                      key={r.fy}
                      className="grid grid-cols-[80px_1fr_1fr_1fr] items-center gap-3"
                    >
                      <span className="font-mono text-[11px] text-zinc-500">
                        FY{String(r.fy).slice(-2)}
                      </span>
                      <span className="tabular-nums text-zinc-700">{r.prior}</span>
                      <input
                        type="number"
                        min={0}
                        max={5000}
                        value={targets[i] ?? ""}
                        onChange={(e) => setTarget(i, e.target.value)}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                      />
                      <span
                        className={`text-right text-xs tabular-nums ${
                          r.delta > 0
                            ? "font-semibold text-emerald-700"
                            : r.delta < 0
                              ? "font-semibold text-rose-700"
                              : "text-zinc-400"
                        }`}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-700">
                  <div>
                    Total new hires{" "}
                    <span className="ml-1 font-semibold text-emerald-700 tabular-nums">
                      {totalNewHires}
                    </span>
                  </div>
                  <div className="text-right">
                    EOY {fys[fys.length - 1] ? `FY${String(fys[fys.length - 1]).slice(-2)}` : "—"}{" "}
                    <span className="ml-1 font-semibold tabular-nums">{finalHeadcount}</span>{" "}
                    <span className="text-zinc-400">staff</span>
                  </div>
                </div>

                <p className="mt-2 text-[10px] text-zinc-400">
                  Saving regenerates the placeholder Growth hires. Existing hand-edited staff are
                  preserved. Salary, super and CPI on the placeholders mirror the average of your
                  current real staff so the cost line stays believable; edit individual rows later
                  if you want to refine.
                </p>
              </div>

              <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Saving…" : "Save growth plan"}
                </button>
              </footer>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
