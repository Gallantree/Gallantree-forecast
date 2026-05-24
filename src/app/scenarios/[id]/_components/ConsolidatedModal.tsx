"use client";

// Full-screen slide-up summary of the per-FY profitability cascade. Same
// data the Overview tab uses, condensed to one row per metric × one column
// per FY plus a 5y total. Used from the page header so it's reachable from
// any tab.

import { useEffect, useState } from "react";
import { fmtMoney2 } from "@/utils/format";
import type { OverviewData } from "./overviewData";

function pct(numer: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((numer / denom) * 100).toFixed(1)}%`;
}

interface Row {
  label: string;
  perFy: number[];
  total: number;
  tone?: "ok" | "warn" | "muted";
  indent?: boolean;
  variant?: "detail" | "total" | "grand";
}

export function ConsolidatedModal({
  data,
  triggerLabel = "Consolidated",
  title = "Consolidated five-year view",
  subtitle = "Year-by-year profit cascade across the full forecast horizon",
}: {
  data: OverviewData;
  triggerLabel?: string;
  title?: string;
  subtitle?: string;
}) {
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

  const { fys, totals, fiveYear } = data;

  // Lay out the cascade so it reads top-down: revenue → opex → EBITDA →
  // depreciation → EBIT → interest → pre-tax → tax → net income, with
  // margins at the bottom.
  const rows: Row[] = [
    {
      label: "Revenue",
      perFy: totals.revenue,
      total: fiveYear.revenue,
      variant: "total",
    },
    {
      label: "OPEX (incl. depreciation)",
      perFy: totals.opex.map((v) => -Math.abs(v)),
      total: -Math.abs(fiveYear.opex),
      tone: "warn",
      indent: true,
    },
    {
      label: "EBITDA",
      perFy: totals.ebitda,
      total: fiveYear.ebitda,
      variant: "total",
      tone: fiveYear.ebitda >= 0 ? "ok" : "warn",
    },
    {
      label: "Less: Depreciation",
      perFy: totals.depreciation.map((v) => -Math.abs(v)),
      total: -Math.abs(fiveYear.depreciation),
      tone: "muted",
      indent: true,
    },
    {
      label: "Less: Issuance cost amortisation",
      perFy: totals.issuanceAmortisation.map((v) => -Math.abs(v)),
      total: -Math.abs(fiveYear.issuanceAmortisation),
      tone: "muted",
      indent: true,
    },
    {
      label: "EBIT (Operating income)",
      perFy: totals.ebit,
      total: fiveYear.ebit,
      variant: "total",
      tone: fiveYear.ebit >= 0 ? "ok" : "warn",
    },
    {
      label: "Less: Interest expense (capital programs)",
      perFy: totals.interestExpense.map((v) => -Math.abs(v)),
      total: -Math.abs(fiveYear.interestExpense),
      tone: "warn",
      indent: true,
    },
    {
      label: "Pre-tax income",
      perFy: totals.pretaxIncome,
      total: fiveYear.pretaxIncome,
      variant: "total",
      tone: fiveYear.pretaxIncome >= 0 ? "ok" : "warn",
    },
    {
      label: "Less: Tax",
      perFy: totals.tax.map((v) => -Math.abs(v)),
      total: -Math.abs(fiveYear.tax),
      tone: "muted",
      indent: true,
    },
    {
      label: "Net income",
      perFy: totals.netIncome,
      total: fiveYear.netIncome,
      variant: "grand",
      tone: fiveYear.netIncome >= 0 ? "ok" : "warn",
    },
  ];

  // Margins computed against revenue per FY + over the 5y total.
  const ebitdaMarginPerFy = totals.ebitda.map((v, i) => pct(v, totals.revenue[i]));
  const netMarginPerFy = totals.netIncome.map((v, i) => pct(v, totals.revenue[i]));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        {triggerLabel}
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
        aria-label="Consolidated five-year view"
        className={`fixed inset-x-0 bottom-0 top-6 z-50 transform overflow-hidden rounded-t-xl bg-zinc-50 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">{title}</h2>
            <p className="text-xs text-zinc-500">{subtitle}</p>
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

        <div className="h-[calc(100%-65px)] overflow-auto">
          {/* Headline tiles */}
          <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="5y Revenue" value={fmtMoney2(fiveYear.revenue)} />
            <Tile label="5y OPEX" value={fmtMoney2(fiveYear.opex)} tone="rose" />
            <Tile
              label="5y EBITDA"
              value={fmtMoney2(fiveYear.ebitda)}
              tone={fiveYear.ebitda >= 0 ? "emerald" : "rose"}
            />
            <Tile
              label="5y Pre-tax"
              value={fmtMoney2(fiveYear.pretaxIncome)}
              tone={fiveYear.pretaxIncome >= 0 ? "emerald" : "rose"}
            />
            <Tile
              label="5y Net income"
              value={fmtMoney2(fiveYear.netIncome)}
              tone={fiveYear.netIncome >= 0 ? "emerald" : "rose"}
            />
            <Tile label="Net margin" value={pct(fiveYear.netIncome, fiveYear.revenue)} />
          </div>

          <div className="px-6 py-6">
            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-zinc-100 text-zinc-600">
                  <tr>
                    <th className="sticky left-0 z-10 w-72 border-b border-r border-zinc-200 bg-zinc-100 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">
                      Line
                    </th>
                    {fys.map((fy, i) => (
                      <th
                        key={fy}
                        className="min-w-[120px] border-b border-zinc-200 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider"
                      >
                        Year {i + 1}
                        <span className="ml-1 font-normal text-zinc-400">
                          · CY{String(fy).slice(-2)}
                        </span>
                      </th>
                    ))}
                    <th className="min-w-[140px] border-b border-l border-zinc-200 bg-zinc-200 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                      5y total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <CascadeRow key={r.label} row={r} />
                  ))}

                  {/* Margins */}
                  <tr>
                    <td
                      colSpan={fys.length + 2}
                      className="border-t-4 border-zinc-200 bg-zinc-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
                    >
                      Margins
                    </td>
                  </tr>
                  <MarginRow
                    label="EBITDA margin"
                    perFy={ebitdaMarginPerFy}
                    total={pct(fiveYear.ebitda, fiveYear.revenue)}
                  />
                  <MarginRow
                    label="Net margin"
                    perFy={netMarginPerFy}
                    total={pct(fiveYear.netIncome, fiveYear.revenue)}
                  />
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function CascadeRow({ row }: { row: Row }) {
  const isGrand = row.variant === "grand";
  const isTotal = row.variant === "total";
  const baseClass = isGrand
    ? "bg-zinc-900 text-white font-semibold"
    : isTotal
      ? "bg-zinc-50 font-semibold text-zinc-900"
      : "text-zinc-700";
  const labelPad = row.indent ? "pl-8" : "pl-4";
  const valueTone = (n: number) => {
    if (isGrand) return "";
    if (row.tone === "warn") return "text-rose-700";
    if (row.tone === "ok") return "text-emerald-700";
    if (row.tone === "muted") return "text-zinc-500";
    return n >= 0 ? "" : "text-rose-700";
  };
  return (
    <tr className={`border-b border-zinc-100 ${baseClass}`}>
      <td
        className={`sticky left-0 z-10 border-r border-zinc-200 ${
          isGrand ? "bg-zinc-900" : isTotal ? "bg-zinc-50" : "bg-white"
        } ${labelPad} py-2`}
      >
        {row.label}
      </td>
      {row.perFy.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-right tabular-nums ${valueTone(v)}`}>
          {fmtMoney2(v)}
        </td>
      ))}
      <td
        className={`border-l border-zinc-200 px-3 py-2 text-right tabular-nums ${
          isGrand ? "bg-zinc-900 text-white" : isTotal ? "bg-zinc-100" : "bg-zinc-50"
        } ${valueTone(row.total)}`}
      >
        {fmtMoney2(row.total)}
      </td>
    </tr>
  );
}

function MarginRow({ label, perFy, total }: { label: string; perFy: string[]; total: string }) {
  return (
    <tr className="border-b border-zinc-100 text-zinc-700">
      <td className="sticky left-0 z-10 border-r border-zinc-200 bg-white pl-4 py-2">{label}</td>
      {perFy.map((v, i) => (
        <td key={i} className="px-3 py-2 text-right tabular-nums">
          {v}
        </td>
      ))}
      <td className="border-l border-zinc-200 bg-zinc-50 px-3 py-2 text-right font-semibold tabular-nums">
        {total}
      </td>
    </tr>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  const valueClass =
    tone === "rose" ? "text-rose-700" : tone === "emerald" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-5 py-4">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}
