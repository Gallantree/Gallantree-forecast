"use client";

import { useRef, useState, useTransition } from "react";
import type { BookGrowthProfilePayload } from "../_actions";

type Risk = BookGrowthProfilePayload["riskLevel"];

const RISK: { value: Risk; label: string; hint: string }[] = [
  { value: "low", label: "Low", hint: "A · LVR 55% · DSCR 1.50 · spread −50bps" },
  { value: "medium", label: "Medium", hint: "B · LVR 65% · DSCR 1.25 · spread as set" },
  { value: "high", label: "High", hint: "C · LVR 72% · DSCR 1.10 · spread +100bps" },
];

export interface BookGrowthProfileInitial {
  capitalProgramId: string;
  fyGrowthPcts: string[];
  avgTenorMonths: number;
  avgSpreadBps: number;
  riskLevel: Risk;
}

export interface ProgramOption {
  _id: string;
  name: string;
  type: string;
}

export function BookGrowthProfileModal({
  fys,
  programs,
  initial,
  triggerLabel,
  triggerClassName,
  saveAction,
}: {
  fys: number[];
  programs: ProgramOption[];
  initial?: BookGrowthProfileInitial;
  triggerLabel: string;
  triggerClassName?: string;
  saveAction: (payload: BookGrowthProfilePayload) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [capitalProgramId, setCapitalProgramId] = useState<string>(
    initial?.capitalProgramId ?? programs[0]?._id ?? "",
  );
  const [risk, setRisk] = useState<Risk>(initial?.riskLevel ?? "medium");
  const [avgTenor, setAvgTenor] = useState<string>(
    String(initial?.avgTenorMonths ?? 36),
  );
  const [avgSpread, setAvgSpread] = useState<string>(
    String(initial?.avgSpreadBps ?? 200),
  );
  const [pcts, setPcts] = useState<string[]>(() =>
    fys.map((_, i) => initial?.fyGrowthPcts[i] ?? ""),
  );

  function openDialog() {
    setOpen(true);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }
  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function submit() {
    if (!capitalProgramId) return;
    const payload: BookGrowthProfilePayload = {
      capitalProgramId,
      fyGrowthPcts: pcts.map((p) => (p.trim() === "" ? "0" : p.trim())),
      avgTenorMonths: Number(avgTenor) || 0,
      avgSpreadBps: Number(avgSpread) || 0,
      riskLevel: risk,
    };
    startTransition(async () => {
      await saveAction(payload);
      closeDialog();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={
          triggerClassName ??
          "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        }
      >
        {triggerLabel}
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          onClose={() => setOpen(false)}
          className="w-[640px] max-w-[90vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              {initial ? "Edit growth profile" : "New growth profile"}
            </h2>
            <button
              type="button"
              onClick={closeDialog}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              ×
            </button>
          </div>

          <div className="flex flex-col gap-4 px-5 py-4 text-xs">
            {programs.length === 0 ? (
              <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Create a capital program first — growth profiles target a
                specific program.
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Capital program">
                <select
                  value={capitalProgramId}
                  onChange={(e) => setCapitalProgramId(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                  disabled={programs.length === 0}
                >
                  {programs.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Risk level">
                <select
                  value={risk}
                  onChange={(e) => setRisk(e.target.value as Risk)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5"
                >
                  {RISK.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[10px] text-zinc-500">
                  {RISK.find((r) => r.value === risk)?.hint}
                </div>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Avg tenor (months)">
                <input
                  inputMode="numeric"
                  value={avgTenor}
                  onChange={(e) => setAvgTenor(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 tabular-nums"
                />
              </Field>
              <Field label="Avg spread (bps)">
                <input
                  inputMode="numeric"
                  value={avgSpread}
                  onChange={(e) => setAvgSpread(e.target.value)}
                  className="w-full rounded-md border border-zinc-300 px-2 py-1.5 tabular-nums"
                />
              </Field>
            </div>

            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Growth % per FY
                <span className="ml-1 font-normal lowercase text-zinc-400">
                  · compounds against the running book
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {fys.map((fy, i) => (
                  <label key={fy} className="flex flex-col items-center gap-0.5">
                    <span className="text-[9px] font-mono text-zinc-500">
                      FY{String(fy).slice(-2)}
                    </span>
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={pcts[i] ?? ""}
                      onChange={(e) => {
                        const next = [...pcts];
                        next[i] = e.target.value;
                        setPcts(next);
                      }}
                      className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
              Synthetic loans will be injected each FY at deterministic-random
              months, assigned to the selected program. Count = round(running
              book size × growth %). Loan size equals the average of existing
              loans in this program.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
            <button
              type="button"
              onClick={closeDialog}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || programs.length === 0 || !capitalProgramId}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save profile"}
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
