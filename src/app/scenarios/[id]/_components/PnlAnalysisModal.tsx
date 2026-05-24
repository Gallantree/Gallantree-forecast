"use client";

// Slide-up Analysis modal for the P&L tab. Charts the cascade across the
// 5-year horizon, OPEX composition, and margin trend. Driven by the same
// OverviewData the Consolidated modal uses so the two stay in sync.

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OverviewData } from "./overviewData";

const COLORS = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  indigo: "#6366f1",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  zinc: "#71717a",
  slate: "#475569",
};
const opexPalette = [
  COLORS.sky,
  COLORS.indigo,
  COLORS.amber,
  COLORS.violet,
  COLORS.teal,
  COLORS.rose,
  COLORS.zinc,
  COLORS.slate,
];

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

const moneyFmt = (v: unknown): string => fmtShort(Number(v ?? 0));
const pctFmt = (v: unknown): string => `${Number(v ?? 0).toFixed(1)}%`;

export function PnlAnalysisModal({
  data,
  triggerLabel = "Analysis",
  title = "P&L analysis",
  subtitle = "Cascade, OPEX composition, and margins across the 5-year horizon",
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

  const { fys, totals, revenueLines, opexLines } = data;

  // ── Cascade trend (line chart) ──────────────────────────────────────────
  const cascadeData = fys.map((fy, i) => ({
    cy: `CY${String(fy).slice(-2)}`,
    Revenue: totals.revenue[i] ?? 0,
    EBITDA: totals.ebitda[i] ?? 0,
    EBIT: totals.ebit[i] ?? 0,
    "Net income": totals.netIncome[i] ?? 0,
  }));

  // ── Revenue composition (stacked bar by FY) ─────────────────────────────
  const revenueComposition = fys.map((fy, i) => {
    const row: Record<string, number | string> = { cy: `CY${String(fy).slice(-2)}` };
    for (const l of revenueLines) {
      // Group by the first two digits of the account code for legibility
      // (4100, 4200 etc. each become their own bucket).
      const label = `${l.accountCode} ${l.accountName ?? ""}`.trim();
      row[label] =
        (l.fyTotals[i] ?? 0) + (typeof row[label] === "number" ? (row[label] as number) : 0);
    }
    return row;
  });
  const revenueKeys = Array.from(
    new Set(revenueLines.map((l) => `${l.accountCode} ${l.accountName ?? ""}`.trim())),
  );

  // ── OPEX composition (stacked bar by FY) ────────────────────────────────
  const opexComposition = fys.map((fy, i) => {
    const row: Record<string, number | string> = { cy: `CY${String(fy).slice(-2)}` };
    for (const l of opexLines) {
      const label = `${l.accountCode} ${l.accountName ?? ""}`.trim();
      row[label] =
        (l.fyTotals[i] ?? 0) + (typeof row[label] === "number" ? (row[label] as number) : 0);
    }
    return row;
  });
  const opexKeys = Array.from(
    new Set(opexLines.map((l) => `${l.accountCode} ${l.accountName ?? ""}`.trim())),
  );

  // ── Margin trend ────────────────────────────────────────────────────────
  const marginTrend = fys.map((fy, i) => {
    const rev = totals.revenue[i] ?? 0;
    const ebitda = totals.ebitda[i] ?? 0;
    const net = totals.netIncome[i] ?? 0;
    return {
      cy: `CY${String(fy).slice(-2)}`,
      "EBITDA margin": rev === 0 ? 0 : (ebitda / rev) * 100,
      "Net margin": rev === 0 ? 0 : (net / rev) * 100,
    };
  });

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
        aria-label={title}
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

        <div className="h-[calc(100%-65px)] overflow-auto p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Cascade trend */}
            <Card title="Profit cascade" subtitle="Revenue → EBITDA → EBIT → Net income, per CY">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={cascadeData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="cy" stroke="#52525b" fontSize={11} />
                  <YAxis stroke="#52525b" fontSize={11} tickFormatter={fmtShort} />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyFmt} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="Revenue"
                    stroke={COLORS.emerald}
                    strokeWidth={2}
                    dot
                  />
                  <Line type="monotone" dataKey="EBITDA" stroke={COLORS.sky} strokeWidth={2} dot />
                  <Line type="monotone" dataKey="EBIT" stroke={COLORS.indigo} strokeWidth={2} dot />
                  <Line
                    type="monotone"
                    dataKey="Net income"
                    stroke={COLORS.amber}
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Margin trend */}
            <Card title="Margins" subtitle="EBITDA & Net margin per CY (% of revenue)">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={marginTrend} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="cy" stroke="#52525b" fontSize={11} />
                  <YAxis stroke="#52525b" fontSize={11} tickFormatter={pctFmt} />
                  <Tooltip contentStyle={tooltipStyle} formatter={pctFmt} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    type="monotone"
                    dataKey="EBITDA margin"
                    stroke={COLORS.emerald}
                    strokeWidth={2}
                    dot
                  />
                  <Line
                    type="monotone"
                    dataKey="Net margin"
                    stroke={COLORS.amber}
                    strokeWidth={2}
                    dot
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            {/* Revenue composition */}
            <Card
              title="Revenue composition"
              subtitle={`Stacked by account · ${revenueKeys.length} streams`}
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={revenueComposition}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="cy" stroke="#52525b" fontSize={11} />
                  <YAxis stroke="#52525b" fontSize={11} tickFormatter={fmtShort} />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyFmt} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  {revenueKeys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="rev"
                      fill={opexPalette[i % opexPalette.length]}
                    >
                      <Cell />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* OPEX composition */}
            <Card
              title="OPEX composition"
              subtitle={`Stacked by account · ${opexKeys.length} categories`}
            >
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={opexComposition} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                  <XAxis dataKey="cy" stroke="#52525b" fontSize={11} />
                  <YAxis stroke="#52525b" fontSize={11} tickFormatter={fmtShort} />
                  <Tooltip contentStyle={tooltipStyle} formatter={moneyFmt} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  {opexKeys.map((k, i) => (
                    <Bar
                      key={k}
                      dataKey={k}
                      stackId="opex"
                      fill={opexPalette[i % opexPalette.length]}
                    >
                      <Cell />
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <header className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        {subtitle ? <p className="text-[11px] text-zinc-500">{subtitle}</p> : null}
      </header>
      {children}
    </section>
  );
}
