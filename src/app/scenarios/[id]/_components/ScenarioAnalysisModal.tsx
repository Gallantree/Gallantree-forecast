"use client";

// Full-width slide-up modal comparing the current scenario against its base.
// Lives in the page header so it's reachable from any tab.
//
// The comparison data is pre-computed server-side (see scenarioComparison.ts)
// and passed in as a prop — when there's no base scenario to compare against
// the button is rendered but the body shows an explanatory message.

import { useEffect, useState } from "react";
import { fmtMoney0, fmtMoney2, fmtNum2 } from "@/utils/format";
import type { ComparisonRow, MetricFormat, ScenarioComparisonData } from "./scenarioComparison";

function fmtCompactMoney(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return fmtMoney0(value);
}

function formatValue(value: number, format: MetricFormat): string {
  switch (format) {
    case "money":
      return fmtMoney2(value);
    case "moneyCompact":
      return fmtCompactMoney(value);
    case "integer":
      return fmtNum2(value).replace(/\.00$/, "");
    case "decimal":
      return fmtNum2(value);
  }
}

function deltaPct(base: number, current: number): string {
  if (base === 0) return current === 0 ? "—" : "n/a";
  const delta = ((current - base) / Math.abs(base)) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function deltaTone(base: number, current: number): "ok" | "warn" | "neutral" {
  if (base === current) return "neutral";
  return current > base ? "ok" : "warn";
}

export function ScenarioAnalysisModal({ data }: { data: ScenarioComparisonData | null }) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
      >
        Scenario Analysis
      </button>

      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Scenario analysis"
        className={`fixed inset-x-0 bottom-0 top-6 z-50 transform overflow-hidden rounded-t-xl bg-zinc-50 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Scenario analysis
            </h2>
            {data ? (
              <p className="text-xs text-zinc-500">
                Comparing <span className="font-semibold text-zinc-700">{data.current.name}</span>{" "}
                against base <span className="font-semibold text-zinc-700">{data.base.name}</span> ·
                deltas are current minus base
              </p>
            ) : (
              <p className="text-xs text-zinc-500">No base scenario found to compare against</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="h-[calc(100%-73px)] overflow-auto">
          {data ? <ComparisonBody data={data} /> : <EmptyState />}
        </div>
      </section>
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-12 text-center">
      <div className="max-w-md">
        <p className="text-sm text-zinc-600">
          This scenario isn&apos;t linked to a base scenario, so there&apos;s nothing to compare
          against. Set a base scenario (one per view mode) to enable side-by-side analysis.
        </p>
      </div>
    </div>
  );
}

function ComparisonBody({ data }: { data: ScenarioComparisonData }) {
  return (
    <div className="space-y-6 px-6 py-6">
      {data.groups.map((g) => (
        <section
          key={g.title}
          className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
        >
          <header className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-600">
            {g.title}
          </header>
          <table className="w-full border-collapse text-sm">
            <thead className="bg-zinc-100 text-zinc-600">
              <tr>
                <th className="w-72 border-b border-r border-zinc-200 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">
                  Metric
                </th>
                <th className="w-32 border-b border-zinc-200 px-3 py-2 text-left text-xs font-medium uppercase tracking-wider">
                  Scenario
                </th>
                {data.fys.map((fy) => (
                  <th
                    key={fy}
                    className="min-w-[110px] border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider"
                  >
                    CY{String(fy).slice(-2)}
                  </th>
                ))}
                <th className="min-w-[120px] border-b border-l border-zinc-200 bg-zinc-200 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((row) => (
                <MetricRows
                  key={row.label}
                  row={row}
                  fys={data.fys}
                  baseName={data.base.name}
                  currentName={data.current.name}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function MetricRows({
  row,
  fys,
  baseName,
  currentName,
}: {
  row: ComparisonRow;
  fys: number[];
  baseName: string;
  currentName: string;
}) {
  // Scalar rows still emit a cell per CY (rendered as a dash) so the column
  // grid stays aligned with the flow/stock rows above. The scalar value
  // itself lives in the Total column.
  const dash = (
    <span key={"dash"} className="text-zinc-300">
      —
    </span>
  );
  return (
    <>
      <tr className="border-t-2 border-zinc-300 bg-white">
        <td
          rowSpan={3}
          className="border-r border-zinc-200 bg-zinc-50 px-4 py-1.5 align-top text-zinc-800"
        >
          <div className="font-medium">{row.label}</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
            {row.totalLabel ?? (row.scalarOnly ? "scalar" : "")}
          </div>
        </td>
        <td className="border-b border-zinc-100 px-3 py-1.5 text-xs text-zinc-500" title={baseName}>
          Base
        </td>
        {row.scalarOnly
          ? fys.map((fy) => (
              <td key={fy} className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums">
                {dash}
              </td>
            ))
          : row.base.map((v, i) => (
              <td
                key={i}
                className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums text-zinc-600"
              >
                {formatValue(v, row.format)}
              </td>
            ))}
        <td className="border-b border-l border-zinc-200 bg-zinc-50 px-3 py-1.5 text-right font-semibold tabular-nums text-zinc-700">
          {formatValue(row.baseTotal, row.format)}
        </td>
      </tr>
      <tr>
        <td
          className="border-b border-zinc-100 px-3 py-1.5 text-xs text-zinc-500"
          title={currentName}
        >
          Current
        </td>
        {row.scalarOnly
          ? fys.map((fy) => (
              <td key={fy} className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums">
                {dash}
              </td>
            ))
          : row.current.map((v, i) => (
              <td
                key={i}
                className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums text-zinc-900"
              >
                {formatValue(v, row.format)}
              </td>
            ))}
        <td className="border-b border-l border-zinc-200 bg-zinc-50 px-3 py-1.5 text-right font-semibold tabular-nums text-zinc-900">
          {formatValue(row.currentTotal, row.format)}
        </td>
      </tr>
      <tr className="bg-zinc-50">
        <td className="border-b border-zinc-200 px-3 py-1.5 text-xs italic text-zinc-500">Δ</td>
        {row.scalarOnly
          ? fys.map((fy) => (
              <td key={fy} className="border-b border-zinc-200 px-3 py-1.5 text-right tabular-nums">
                {dash}
              </td>
            ))
          : row.current.map((v, i) => (
              <DeltaCell key={i} base={row.base[i] ?? 0} current={v} format={row.format} />
            ))}
        <td className="border-b border-l border-zinc-200 bg-zinc-100 px-3 py-1.5 text-right font-semibold">
          <DeltaCellContent base={row.baseTotal} current={row.currentTotal} format={row.format} />
        </td>
      </tr>
    </>
  );
}

function DeltaCell({
  base,
  current,
  format,
}: {
  base: number;
  current: number;
  format: MetricFormat;
}) {
  return (
    <td className="border-b border-zinc-200 px-3 py-1.5 text-right tabular-nums">
      <DeltaCellContent base={base} current={current} format={format} />
    </td>
  );
}

function DeltaCellContent({
  base,
  current,
  format,
}: {
  base: number;
  current: number;
  format: MetricFormat;
}) {
  const diff = current - base;
  const tone = deltaTone(base, current);
  const toneClass =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "text-zinc-400";
  const sign = diff > 0 ? "+" : diff < 0 ? "" : "";
  return (
    <span className={toneClass}>
      <span className="tabular-nums">
        {sign}
        {formatValue(diff, format)}
      </span>
      <span className="ml-1 text-[10px] uppercase tracking-wider">{deltaPct(base, current)}</span>
    </span>
  );
}
