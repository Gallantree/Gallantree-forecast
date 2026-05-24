"use client";

import { useState, useTransition } from "react";
import type { ControlPanelPayload } from "../_actions";
import { updateControlPanel, updateScenarioMeta, wipeScenarioData } from "../_actions";

export interface ControlPanelInitial {
  name: string;
  status: "draft" | "active" | "archived";
  baseRateType?: "BBSW" | "BBSY" | "SOFR";
  baseRateBps?: number;
  firstYearLabel?: number;
  taxRatePct?: string;
}

const STATUS_OPTIONS: {
  value: "draft" | "active" | "archived";
  label: string;
  hint: string;
  tone: "draft" | "active" | "archived";
}[] = [
  { value: "draft", label: "Draft", hint: "work-in-progress", tone: "draft" },
  { value: "active", label: "Active", hint: "current working version", tone: "active" },
  { value: "archived", label: "Archived", hint: "frozen, read-mostly", tone: "archived" },
];

const STATUS_TONE: Record<"draft" | "active" | "archived", { bg: string; text: string }> = {
  draft: { bg: "bg-zinc-100", text: "text-zinc-700" },
  active: { bg: "bg-emerald-100", text: "text-emerald-800" },
  archived: { bg: "bg-amber-100", text: "text-amber-800" },
};

const BASE_RATES: { value: "BBSW" | "BBSY" | "SOFR"; label: string; hint: string }[] = [
  { value: "BBSW", label: "BBSW", hint: "Bank Bill Swap (AU)" },
  { value: "BBSY", label: "BBSY", hint: "Bank Bill Swap Yield (AU)" },
  { value: "SOFR", label: "SOFR", hint: "Secured Overnight Financing Rate (US)" },
];

export function ControlPanelTab({
  scenarioId,
  initial,
  horizonYears,
}: {
  scenarioId: string;
  initial: ControlPanelInitial;
  horizonYears: number;
}) {
  const [pending, startTransition] = useTransition();
  const [metaPending, startMetaTransition] = useTransition();
  const [wipePending, startWipeTransition] = useTransition();
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState<"draft" | "active" | "archived">(initial.status);
  const [baseRateType, setBaseRateType] = useState<"BBSW" | "BBSY" | "SOFR">(
    initial.baseRateType ?? "BBSW",
  );
  const [baseRateBps, setBaseRateBps] = useState(
    initial.baseRateBps !== undefined ? String(initial.baseRateBps) : "420",
  );
  const [firstYearLabel, setFirstYearLabel] = useState(
    initial.firstYearLabel !== undefined ? String(initial.firstYearLabel) : "2026",
  );
  const [taxRatePct, setTaxRatePct] = useState(
    initial.taxRatePct !== undefined ? initial.taxRatePct : "30",
  );

  function onSave() {
    const payload: ControlPanelPayload = {
      baseRateType,
      baseRateBps: baseRateBps ? Number(baseRateBps) : undefined,
      firstYearLabel: firstYearLabel ? Number(firstYearLabel) : undefined,
      taxRatePct: taxRatePct === "" ? undefined : Number(taxRatePct),
    };
    startTransition(async () => {
      await updateControlPanel(scenarioId, payload);
    });
  }

  function onSaveMeta() {
    if (!name.trim()) return;
    startMetaTransition(async () => {
      await updateScenarioMeta(scenarioId, { name: name.trim(), status });
    });
  }

  const firstYear = Number(firstYearLabel) || 2026;
  const yearPreview = Array.from({ length: horizonYears }, (_, i) => firstYear + i);

  return (
    <div className="flex h-full flex-col overflow-auto bg-white">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-xs">
        <h2 className="text-sm font-semibold text-zinc-900">Control panel</h2>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          Global rate + year-label settings for this scenario. These flow into variable-rate
          liability calculations and Overview / Valuation labels.
        </p>
      </div>

      <div className="flex flex-col gap-6 p-6">
        {/* Scenario meta */}
        <section className="rounded-md border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Scenario
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Rename the scenario or flip its lifecycle status. Archived scenarios stay accessible
              but are clearly marked stale.
            </p>
          </header>
          <div className="grid grid-cols-2 gap-4 p-4 text-xs">
            <Field label="Name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
                className="rounded-md border border-zinc-300 px-2 py-1"
              />
            </Field>
            <Field label="Status">
              <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
                {STATUS_OPTIONS.map((s) => {
                  const active = status === s.value;
                  const tone = STATUS_TONE[s.tone];
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setStatus(s.value)}
                      className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition ${
                        active
                          ? `${tone.bg} ${tone.text} shadow`
                          : "text-zinc-600 hover:text-zinc-900"
                      }`}
                      title={s.hint}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
              <span className="text-[10px] text-zinc-400">
                {STATUS_OPTIONS.find((s) => s.value === status)?.hint}
              </span>
            </Field>
          </div>
          <footer className="flex justify-end border-t border-zinc-100 bg-zinc-50/50 px-4 py-2">
            <button
              type="button"
              onClick={onSaveMeta}
              disabled={metaPending || !name.trim()}
              className="rounded-md bg-zinc-900 px-3 py-1 text-[11px] font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {metaPending ? "Saving…" : "Save scenario"}
            </button>
          </footer>
        </section>

        {/* Base rate */}
        <section className="rounded-md border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Base rate
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Reference rate used by variable-rate liability tranches in capital programs.
            </p>
          </header>
          <div className="grid grid-cols-2 gap-4 p-4 text-xs">
            <Field label="Rate type">
              <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
                {BASE_RATES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setBaseRateType(r.value)}
                    className={`flex-1 rounded px-2 py-1 text-[11px] font-medium ${
                      baseRateType === r.value
                        ? "bg-white text-zinc-900 shadow"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                    title={r.hint}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] text-zinc-400">
                {BASE_RATES.find((r) => r.value === baseRateType)?.hint}
              </span>
            </Field>
            <Field label={`${baseRateType} rate (bps)`} hint="e.g. 420">
              <div className="flex items-center gap-2">
                <input
                  value={baseRateBps}
                  onChange={(e) => setBaseRateBps(e.target.value)}
                  inputMode="decimal"
                  className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
                />
                <span className="text-[11px] text-zinc-500">
                  ={" "}
                  <span className="font-semibold text-zinc-700">
                    {(Number(baseRateBps) / 100).toFixed(2)}%
                  </span>
                </span>
              </div>
            </Field>
          </div>
        </section>

        {/* Tax */}
        <section className="rounded-md border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">Tax</h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Corporate tax rate applied to pre-tax profit in the P&amp;L. AU company rate is 30%
              (25% for base-rate entities).
            </p>
          </header>
          <div className="p-4 text-xs">
            <Field label="Corporate tax rate (%)" hint="e.g. 30">
              <input
                value={taxRatePct}
                onChange={(e) => setTaxRatePct(e.target.value)}
                inputMode="decimal"
                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
              />
            </Field>
          </div>
        </section>

        {/* Year labels */}
        <section className="rounded-md border border-zinc-200 bg-white">
          <header className="border-b border-zinc-100 bg-zinc-50 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700">
              Year labels
            </h3>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Map Year 1 of the forecast to a calendar year. Used by Overview and Valuation columns.
            </p>
          </header>
          <div className="flex flex-col gap-4 p-4 text-xs">
            <Field label="Year 1 calendar year">
              <input
                value={firstYearLabel}
                onChange={(e) => setFirstYearLabel(e.target.value)}
                inputMode="numeric"
                className="w-32 rounded-md border border-zinc-300 px-2 py-1 text-right tabular-nums"
              />
            </Field>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Preview
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {yearPreview.map((y, i) => (
                  <span
                    key={i}
                    className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-mono text-zinc-700"
                  >
                    Y{i + 1} = CY{y}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={pending}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save control panel"}
          </button>
        </div>

        {/* Danger zone */}
        <section className="rounded-md border border-rose-200 bg-rose-50">
          <header className="border-b border-rose-100 bg-rose-100/60 px-4 py-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-rose-800">
              Danger zone
            </h3>
            <p className="mt-0.5 text-[11px] text-rose-700">
              Wipe drivers, headcount, loans, capital programs, platform licenses, and capital
              raises for this scenario. Use this when reseeding under a new period convention.
              Scenario-level settings (assumptions, control panel, view mode) are kept.
            </p>
          </header>
          <div className="flex items-center justify-end gap-3 p-4">
            <span className="text-[11px] text-rose-700">This cannot be undone.</span>
            <button
              type="button"
              onClick={() => {
                if (!confirm("Wipe all operational data for this scenario? This cannot be undone."))
                  return;
                startWipeTransition(async () => {
                  await wipeScenarioData(scenarioId);
                });
              }}
              disabled={wipePending}
              className="rounded-md border border-rose-300 bg-white px-4 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
            >
              {wipePending ? "Wiping…" : "Wipe scenario data"}
            </button>
          </div>
        </section>
      </div>
    </div>
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
