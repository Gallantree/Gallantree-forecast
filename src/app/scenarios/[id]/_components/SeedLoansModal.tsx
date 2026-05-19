"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { fiscalYearOf } from "@/constants/periods";
import { type SeedResult, seedLoansByFy } from "../_actions";
import type { ProgramOption } from "./LoansTab";

type Style = "CRE_CLO" | "CMBS";

const STYLE_HINTS: Record<Style, string> = {
  CRE_CLO:
    "~85% Transitional · spread 270-370 bps · balance $5m-$55m · tenor 24-48 mo · LVR 55-75% · DSCR 1.05-1.40",
  CMBS: "~90% Stabilised · spread 90-270 bps · balance $20m-$150m · tenor 60-120 mo · LVR 50-68% · DSCR 1.25-1.80",
};

// Per-program defaults — a typical CRE CLO holds 35-40 loans; CMBS deals
// are larger-balance with 40-50 loans. Warehouse facilities sit in between.
const DEFAULT_PER_PROGRAM: Record<string, number> = {
  CRE_CLO: 38,
  CMBS: 45,
  WAREHOUSE: 40,
};

type RiskLevel = 1 | 2 | 3 | 4 | 5;
const RISK_LEVELS: RiskLevel[] = [1, 2, 3, 4, 5];
const RISK_LABEL: Record<RiskLevel, string> = {
  1: "Very low",
  2: "Low",
  3: "Medium",
  4: "High",
  5: "Very high",
};
const DEFAULT_RISK: RiskLevel = 3;

interface ProgramRow {
  programId: string;
  count: string;
  riskLevel: RiskLevel;
}

// Convert a "YYYY-MM" period key to its Australian fiscal year. Returns null
// for unparseable input so the caller can fall back to the scenario horizon.
function periodKeyToFy(key: string | undefined): number | null {
  if (!key) return null;
  const [y, m] = key.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return fiscalYearOf(y, m);
}

// Return every FY a program is active across, inclusive of both endpoints.
// Clipped to the scenario horizon `fys` so we never seed into a year the
// scenario doesn't model. If the program has no start key, falls back to
// the full horizon.
function fysForProgram(
  program: Pick<ProgramOption, "startPeriodKey" | "endPeriodKey">,
  fys: number[],
): number[] {
  if (fys.length === 0) return [];
  const startFy = periodKeyToFy(program.startPeriodKey) ?? fys[0];
  const endFy = periodKeyToFy(program.endPeriodKey) ?? fys[fys.length - 1];
  return fys.filter((fy) => fy >= startFy && fy <= endFy);
}

// Distribute `total` loans across `n` FYs as evenly as possible. The first
// `total % n` years get one extra so the sum is always exactly `total`.
function distributeEvenly(total: number, n: number): number[] {
  if (n <= 0 || total <= 0) return [];
  const base = Math.floor(total / n);
  const extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
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
  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "warn" } | null>(null);

  const [style, setStyle] = useState<Style>("CRE_CLO");

  // Programs whose type matches the chosen style. CRE_CLO → CRE_CLO only;
  // CMBS → CMBS + WAREHOUSE (warehouse facilities are stylistically similar
  // and routinely share a seed pattern with CMBS).
  const matchingPrograms = useMemo(
    () =>
      programs
        .filter((p) =>
          style === "CRE_CLO" ? p.type === "CRE_CLO" : p.type === "CMBS" || p.type === "WAREHOUSE",
        )
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [programs, style],
  );

  // One row per matching program; default count comes from the program type.
  const buildDefaultRows = (list: ProgramOption[]): ProgramRow[] =>
    list.map((p) => ({
      programId: p._id,
      count: String(DEFAULT_PER_PROGRAM[p.type] ?? 40),
      riskLevel: DEFAULT_RISK,
    }));

  const [rows, setRows] = useState<ProgramRow[]>(() => buildDefaultRows(matchingPrograms));

  // When the style flips or the underlying program list changes, rebuild
  // rows so the grid mirrors the new program set.
  useEffect(() => {
    setRows(buildDefaultRows(matchingPrograms));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchingPrograms]);

  const total = rows.reduce((acc, r) => acc + (Number(r.count) || 0), 0);

  // Body-scroll lock + ESC-to-close while open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function setRow(programId: string, patch: Partial<ProgramRow>) {
    setRows((prev) => prev.map((r) => (r.programId === programId ? { ...r, ...patch } : r)));
  }

  function submit() {
    // Each row → spread its count evenly across the FYs the program covers.
    // Result: a flat list of (fy, count, capitalProgramId) the existing
    // server action consumes without modification.
    const fyAssignments: Array<{
      fy: number;
      count: number;
      capitalProgramId: string;
      riskLevel: RiskLevel;
    }> = [];
    for (const row of rows) {
      const count = Math.floor(Number(row.count) || 0);
      if (count <= 0) continue;
      const program = matchingPrograms.find((p) => p._id === row.programId);
      if (!program) continue;
      const activeFys = fysForProgram(program, fys);
      if (activeFys.length === 0) continue;
      const split = distributeEvenly(count, activeFys.length);
      activeFys.forEach((fy, i) => {
        if (split[i] > 0) {
          fyAssignments.push({
            fy,
            count: split[i],
            capitalProgramId: row.programId,
            riskLevel: row.riskLevel,
          });
        }
      });
    }

    if (fyAssignments.length === 0) {
      setToast({ msg: "Enter a positive loan count for at least one program.", tone: "warn" });
      return;
    }

    const seedTotal = fyAssignments.reduce((a, x) => a + x.count, 0);
    const programCount = new Set(fyAssignments.map((a) => a.capitalProgramId)).size;
    setToast({
      msg: `Asking Claude to generate ${seedTotal} loans across ${programCount} program${programCount === 1 ? "" : "s"}…`,
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
        setOpen(false);
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
        onClick={() => setOpen(true)}
        disabled={!enabled}
        title={
          enabled
            ? "AI-generated loan seed — count per capital program, distributed across the program's active FYs"
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

      {open ? (
        <>
          {/* Backdrop */}
          <div
            aria-hidden="true"
            onClick={() => !pending && setOpen(false)}
            className="fixed inset-0 z-[90] bg-zinc-900/40 backdrop-blur-sm"
          />
          {/* Centered modal */}
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="seed-loans-title"
            className="fixed inset-0 z-[91] grid place-items-center p-4"
          >
            <div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xl">
              <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
                <h2
                  id="seed-loans-title"
                  className="text-sm font-semibold tracking-tight text-zinc-900"
                >
                  Seed loans (AI-generated)
                </h2>
                <button
                  type="button"
                  onClick={() => !pending && setOpen(false)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Close"
                >
                  ×
                </button>
              </header>

              <div className="flex flex-1 flex-col gap-4 overflow-auto px-5 py-4 text-xs">
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
                      Loans per capital program
                    </span>
                    <span className="text-[11px] text-zinc-500">
                      Total{" "}
                      <span className="font-semibold tabular-nums text-zinc-900">{total}</span>
                    </span>
                  </div>

                  {matchingPrograms.length === 0 ? (
                    <div className="rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                      No {style === "CRE_CLO" ? "CRE CLO" : "CMBS / Warehouse"} programs exist yet.
                      Seed programs first on the Capital Programs tab.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {/* Header row */}
                      <div className="grid grid-cols-[1fr_140px_180px_80px] items-center gap-3 border-b border-zinc-100 pb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                        <span>Capital program</span>
                        <span>Active FYs</span>
                        <span>Risk profile</span>
                        <span className="text-right">Loans</span>
                      </div>

                      {matchingPrograms.map((p) => {
                        const activeFys = fysForProgram(p, fys);
                        const row = rows.find((r) => r.programId === p._id);
                        const count = Math.floor(Number(row?.count) || 0);
                        const split =
                          activeFys.length > 0 && count > 0
                            ? distributeEvenly(count, activeFys.length)
                            : [];
                        const fyLabel =
                          activeFys.length === 0
                            ? "—"
                            : activeFys.length === 1
                              ? `FY${String(activeFys[0]).slice(-2)}`
                              : `FY${String(activeFys[0]).slice(-2)} → FY${String(activeFys[activeFys.length - 1]).slice(-2)}`;
                        const splitTitle =
                          split.length > 1
                            ? `Split: ${activeFys
                                .map((fy, i) => `FY${String(fy).slice(-2)}=${split[i]}`)
                                .join(", ")}`
                            : undefined;
                        const currentRisk = row?.riskLevel ?? DEFAULT_RISK;
                        return (
                          <div
                            key={p._id}
                            className="grid grid-cols-[1fr_140px_180px_80px] items-center gap-3"
                          >
                            <span className="truncate text-zinc-800" title={p.name}>
                              {p.name}
                            </span>
                            <span
                              className="font-mono text-[11px] text-zinc-500"
                              title={splitTitle}
                            >
                              {fyLabel}
                              {activeFys.length > 1 && count > 0 ? (
                                <span className="ml-1 text-zinc-400">
                                  · {activeFys.length}y split
                                </span>
                              ) : null}
                            </span>
                            <RiskPicker
                              value={currentRisk}
                              onChange={(r) => setRow(p._id, { riskLevel: r })}
                            />
                            <input
                              type="number"
                              min={0}
                              max={1500}
                              value={row?.count ?? ""}
                              onChange={(e) => setRow(p._id, { count: e.target.value })}
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-1.5 text-[10px] text-zinc-400">
                    Loans are distributed evenly across each program&apos;s active FYs based on its
                    start and end periods. Risk profile shifts the LVR / DSCR / spread / grade
                    distributions for that program&apos;s loans. The AI call is capped at 300 loans
                    per FY-program slice.
                  </div>
                </div>

                <div className="rounded-md bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
                  Loans will be deterministically populated for every field (borrower, state,
                  postcode, location, asset class, LVR, DSCR, NOI, NCF, ICR, WALE, internal grade,
                  indicative ratings, all-in interest, etc.). One AI call per FY-program slice —
                  expect ~10-30s each.
                </div>
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
                  disabled={pending || matchingPrograms.length === 0 || total === 0}
                  className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Seeding…" : `Seed ${total} loan${total === 1 ? "" : "s"}`}
                </button>
              </footer>
            </div>
          </div>
        </>
      ) : null}

      {/* RiskPicker is defined below */}
      {toast ? (
        <div
          className={`fixed bottom-4 right-4 z-[120] rounded-md px-4 py-2 text-xs font-medium shadow-lg ${
            toast.tone === "warn"
              ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200"
              : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          }`}
        >
          {toast.msg}
        </div>
      ) : null}
    </>
  );
}

// 5-tick segmented control. Compact enough to sit in the per-program row
// without breaking the layout. The selected segment shows in zinc-900;
// the colour stops grade from emerald (very low) → rose (very high) so a
// glance at the modal reveals the portfolio's overall risk skew.
const RISK_TONE: Record<RiskLevel, string> = {
  1: "bg-emerald-500",
  2: "bg-emerald-400",
  3: "bg-amber-400",
  4: "bg-orange-500",
  5: "bg-rose-500",
};

function RiskPicker({ value, onChange }: { value: RiskLevel; onChange: (r: RiskLevel) => void }) {
  return (
    <div className="flex items-center gap-1">
      <div className="inline-flex overflow-hidden rounded-md border border-zinc-300">
        {RISK_LEVELS.map((r) => {
          const selected = r === value;
          return (
            <button
              key={r}
              type="button"
              onClick={() => onChange(r)}
              title={RISK_LABEL[r]}
              aria-label={`Risk ${r} of 5 — ${RISK_LABEL[r]}`}
              aria-pressed={selected}
              className={`h-6 w-6 text-[10px] font-semibold transition ${
                selected ? `${RISK_TONE[r]} text-white` : "bg-white text-zinc-500 hover:bg-zinc-50"
              } ${r > 1 ? "border-l border-zinc-300" : ""}`}
            >
              {r}
            </button>
          );
        })}
      </div>
      <span className="hidden text-[10px] text-zinc-500 md:inline">{RISK_LABEL[value]}</span>
    </div>
  );
}
