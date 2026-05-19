"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ProgramOption } from "./LoansTab";
import { seedLoansByFy, type SeedResult } from "../_actions";

type Style = "CRE_CLO" | "CMBS";

const STYLE_HINTS: Record<Style, string> = {
  CRE_CLO:
    "~85% Transitional · spread 270-370 bps · balance $5m-$55m · tenor 24-48 mo · LVR 55-75% · DSCR 1.05-1.40",
  CMBS:
    "~90% Stabilised · spread 90-270 bps · balance $20m-$150m · tenor 60-120 mo · LVR 50-68% · DSCR 1.25-1.80",
};

const DEFAULT_RAMP = [220, 320, 400, 450, 500];

interface FyRow {
  count: string;
  capitalProgramId: string;
}

export function SeedLoansModal({
  scenarioId,
  enabled,
  fys,
  programs,
  triggerClassName,
}: {
  scenarioId: string;
  enabled: boolean;
  fys: number[];
  programs: ProgramOption[];
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(
    null,
  );
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [style, setStyle] = useState<Style>("CRE_CLO");

  // Programs matching the selected style. CRE_CLO style → CRE_CLO type;
  // CMBS style → CMBS or WAREHOUSE.
  const matchingPrograms = useMemo(
    () =>
      programs
        .filter((p) =>
          style === "CRE_CLO"
            ? p.type === "CRE_CLO"
            : p.type === "CMBS" || p.type === "WAREHOUSE",
        )
        // Stable sort by name so the default round-robin is predictable.
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [programs, style],
  );

  // Per-FY rows: count + program. Default rotates programs across years so
  // a 5-FY seed naturally spreads loans across multiple deals.
  const buildDefaultRows = (): FyRow[] =>
    fys.map((_, i) => ({
      count: String(DEFAULT_RAMP[i] ?? 500),
      capitalProgramId:
        matchingPrograms[i % Math.max(1, matchingPrograms.length)]?._id ?? "",
    }));

  const [rows, setRows] = useState<FyRow[]>(buildDefaultRows);

  // When the user flips style, reset program assignments (counts preserved).
  useEffect(() => {
    setRows((prev) =>
      prev.map((r, i) => ({
        count: r.count,
        capitalProgramId:
          matchingPrograms[i % Math.max(1, matchingPrograms.length)]?._id ?? "",
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [style]);

  const total = rows.reduce((acc, r) => acc + (Number(r.count) || 0), 0);
  const activeFyCount = rows.filter((r) => (Number(r.count) || 0) > 0).length;

  function openDialog() {
    setOpen(true);
    requestAnimationFrame(() => dialogRef.current?.showModal());
  }
  function closeDialog() {
    dialogRef.current?.close();
    setOpen(false);
  }

  function setRow(i: number, patch: Partial<FyRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    const fyAssignments = fys
      .map((fy, i) => ({
        fy,
        count: Math.floor(Number(rows[i]?.count) || 0),
        capitalProgramId: rows[i]?.capitalProgramId ?? "",
      }))
      .filter((x) => x.count > 0);
    if (fyAssignments.length === 0) {
      setToast({ msg: "Enter at least one non-zero FY count.", tone: "warn" });
      return;
    }
    if (fyAssignments.some((a) => !a.capitalProgramId)) {
      setToast({
        msg: "Pick a capital program for every FY with a non-zero count.",
        tone: "warn",
      });
      return;
    }
    const seedTotal = fyAssignments.reduce((a, x) => a + x.count, 0);
    setToast({
      msg: `Asking Claude to generate ${seedTotal} loans across ${fyAssignments.length} FY${fyAssignments.length === 1 ? "" : "s"}…`,
      tone: "ok",
    });
    startTransition(async () => {
      const res: SeedResult = await seedLoansByFy(scenarioId, {
        style,
        fyAssignments,
      });
      if (res.ok) {
        setToast({ msg: `Seeded ${res.created} loans.`, tone: "ok" });
        setTimeout(() => setToast(null), 5000);
        closeDialog();
      } else {
        setToast({
          msg: `Seed failed: ${res.error ?? "unknown error"}`,
          tone: "warn",
        });
        setTimeout(() => setToast(null), 10000);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={!enabled}
        title={
          enabled
            ? "AI-generated loan seed with per-FY counts and program assignment"
            : "Set ANTHROPIC_API_KEY to enable"
        }
        className={
          triggerClassName ??
          (enabled
            ? "rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            : "rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-400")
        }
      >
        {pending ? "Seeding…" : "Seed loans"}
      </button>
      {open && (
        <dialog
          ref={dialogRef}
          onClose={() => setOpen(false)}
          className="w-[720px] max-w-[92vw] rounded-lg border border-zinc-200 p-0 shadow-xl backdrop:bg-zinc-900/40"
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              Seed loans (AI-generated)
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
            <div>
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Style preset
              </div>
              <div className="flex gap-2">
                {(["CRE_CLO", "CMBS"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStyle(s)}
                    className={`flex-1 rounded-md border px-3 py-2 text-left transition ${
                      style === s
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      {s === "CRE_CLO" ? "CRE CLO" : "CMBS"}
                    </div>
                    <div
                      className={`mt-0.5 text-[10px] ${style === s ? "text-zinc-300" : "text-zinc-500"}`}
                    >
                      {s === "CRE_CLO" ? "Transitional bias" : "Stabilised bias"}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
                {STYLE_HINTS[style]}
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Loans per fiscal year · target program
                </span>
                <span className="text-[11px] text-zinc-500">
                  Total{" "}
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {total}
                  </span>
                  <span className="ml-2 text-zinc-400">
                    across {activeFyCount} FY{activeFyCount === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              {matchingPrograms.length === 0 ? (
                <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  No {style === "CRE_CLO" ? "CRE CLO" : "CMBS / Warehouse"}{" "}
                  programs exist yet. Seed programs first on the Capital Programs
                  tab.
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {fys.map((fy, i) => (
                    <div
                      key={fy}
                      className="grid grid-cols-[64px_88px_1fr] items-center gap-2"
                    >
                      <span className="text-[11px] font-mono text-zinc-500">
                        FY{String(fy).slice(-2)}
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={300}
                        value={rows[i]?.count ?? ""}
                        onChange={(e) => setRow(i, { count: e.target.value })}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                      />
                      <select
                        value={rows[i]?.capitalProgramId ?? ""}
                        onChange={(e) =>
                          setRow(i, { capitalProgramId: e.target.value })
                        }
                        className="w-full rounded-md border border-zinc-300 px-2 py-1"
                      >
                        {matchingPrograms.map((p) => (
                          <option key={p._id} value={p._id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1.5 text-[10px] text-zinc-400">
                Each FY can target a different capital program. Capped at 300
                loans per FY per AI call.
              </div>
            </div>

            <div className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
              Loans will be deterministically populated for every field
              (borrower, state, postcode, location, asset class, LVR, DSCR, NOI,
              NCF, ICR, WALE, internal grade, indicative ratings, all-in
              interest, etc.). One AI call per active FY — expect ~10-30s each.
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3">
            <button
              type="button"
              onClick={closeDialog}
              disabled={pending}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={pending || matchingPrograms.length === 0 || total === 0}
              className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Seeding…" : `Seed ${total} loan${total === 1 ? "" : "s"}`}
            </button>
          </div>
        </dialog>
      )}
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
