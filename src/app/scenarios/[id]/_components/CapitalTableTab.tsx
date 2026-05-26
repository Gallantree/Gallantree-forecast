"use client";

import React, { useState, useTransition } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { MarketTestResult } from "../_actions";
import {
  createShareholder,
  deleteShareholder,
  runMarketTest,
  seedShareholders,
  updateCapTableOptionPools,
  updateShareholder,
} from "../_actions";
import { AddShareholderModal } from "./AddShareholderModal";
import type { CapitalRaiseRow, InvestorRow } from "./CapitalRaisesTab";
import { SeedShareholdersModal } from "./SeedShareholdersModal";
import type { ValuationData } from "./ValuationTab";

export interface ShareholderRow {
  _id: string;
  name: string;
  entityTrust?: string;
  shareClass: string;
  shares: number;
  pricePerShare: string;
  beneficiallyHeld: boolean;
  dateOfIssue: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  "Founder Shares": "#7c3aed",
  Ordinary: "#2563eb",
  Preference: "#059669",
};
const CLASS_BADGE: Record<string, string> = {
  "Founder Shares": "bg-violet-100 text-violet-800",
  Ordinary: "bg-blue-100 text-blue-700",
  Preference: "bg-emerald-100 text-emerald-700",
};
const CHART_PALETTE = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#6366f1",
  "#0d9488",
  "#b45309",
  "#e11d48",
  "#1d4ed8",
  "#7c3aed",
];
const STATUS_TONE: Record<string, string> = {
  committed: "bg-sky-100 text-sky-800",
  funded: "bg-emerald-100 text-emerald-800",
  withdrawn: "bg-zinc-100 text-zinc-500 line-through",
};

function fmt(n: number) {
  return n.toLocaleString("en-AU");
}
function fmtMoney(n: number) {
  return n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}
function fmtM(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${fmtMoney(n)}`;
}

type InternalTab = "overview" | "combined" | "value-growth" | "market-test";
type ChartMode = "holder" | "class";
type ValModel = "dcf" | "ev-ebitda" | "ev-revenue" | "pe" | "pb";

// ── Root component ────────────────────────────────────────────────────────────

export function CapitalTableTab({
  scenarioId,
  shareholders,
  raises,
  valuation = null,
  firstCalendarYear = 2026,
  initialEsopPcts = [0, 0, 0, 0, 0],
  initialEarnBackPcts = [0, 0, 0, 0, 0],
}: {
  scenarioId: string;
  shareholders: ShareholderRow[];
  raises: CapitalRaiseRow[];
  valuation?: ValuationData | null;
  firstCalendarYear?: number;
  initialEsopPcts?: number[];
  initialEarnBackPcts?: number[];
}) {
  const [internalTab, setInternalTab] = useState<InternalTab>("overview");
  const [currentPrice, setCurrentPrice] = useState("4.00");
  const [esopPctByYear, setEsopPctByYear] = useState<number[]>(initialEsopPcts);
  const [earnBackPctByYear, setEarnBackPctByYear] = useState<number[]>(initialEarnBackPcts);
  const [, startSaveTransition] = useTransition();

  function saveOptionPools(esop: number[], earnBack: number[]) {
    setEsopPctByYear(esop);
    setEarnBackPctByYear(earnBack);
    startSaveTransition(async () => {
      await updateCapTableOptionPools(scenarioId, esop, earnBack);
    });
  }

  const currentPriceNum = Number(currentPrice) || 0;
  const totalShares = shareholders.reduce((s, r) => s + r.shares, 0);
  const marketCap = totalShares * currentPriceNum;
  const totalPaidIn = shareholders.reduce((s, r) => s + r.shares * Number(r.pricePerShare), 0);

  const totalRaiseTarget = raises.reduce((s, r) => s + Number(r.targetSize), 0);
  const totalCommitted = raises.reduce(
    (s, r) =>
      s +
      r.investors
        .filter((i) => i.status !== "withdrawn")
        .reduce((a, i) => a + Number(i.commitment), 0),
    0,
  );
  const totalFunded = raises.reduce(
    (s, r) =>
      s +
      r.investors
        .filter((i) => i.status === "funded")
        .reduce((a, i) => a + Number(i.commitment), 0),
    0,
  );

  const INTERNAL_TABS: { key: InternalTab; label: string }[] = [
    { key: "overview", label: "Capital Table" },
    { key: "combined", label: "Cap Table + Investors" },
    { key: "value-growth", label: "Value Growth" },
    { key: "market-test", label: "Market Test" },
  ];

  // Combined-view derived counts (computed here so metrics can use them)
  const totalNonWithdrawnInvestors = raises.reduce(
    (s, r) => s + r.investors.filter((i) => i.status !== "withdrawn").length,
    0,
  );
  const totalHolders = shareholders.length + totalNonWithdrawnInvestors;
  const totalCapitalRaised = totalPaidIn + totalFunded;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Capital Table</h2>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Gallantree Group Pty Ltd · ACN 644 812 617
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SeedShareholdersModal
              existingCount={shareholders.length}
              saveAction={() => seedShareholders(scenarioId)}
            />
            <AddShareholderModal saveAction={(payload) => createShareholder(scenarioId, payload)} />
          </div>
        </div>
      </div>

      {/* Internal tab bar — sits above metrics so they respond to the active view */}
      <div className="flex gap-0 border-b border-zinc-200 bg-white px-4">
        {INTERNAL_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setInternalTab(t.key)}
            className={[
              "border-b-2 px-4 py-2.5 text-xs font-medium transition-colors",
              internalTab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:text-zinc-700",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Metrics strip — content differs per tab */}
      {internalTab === "overview" && (
        <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
          <Metric label="Total shareholders" value={String(shareholders.length)} />
          <Metric label="Total shares issued" value={fmt(totalShares)} />
          <Metric label="Total paid-in capital" value={`$${fmtMoney(totalPaidIn)}`} />
          <SharePriceMetric
            currentPrice={currentPrice}
            onChange={setCurrentPrice}
            marketCap={marketCap}
          />
        </div>
      )}
      {internalTab === "combined" && (
        <div className="border-b border-zinc-200 bg-white">
          <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-100">
            <Metric
              label="Total holders"
              value={String(totalHolders)}
              sub={`${shareholders.length} shareholders + ${totalNonWithdrawnInvestors} investors`}
            />
            <Metric label="Total shares issued" value={fmt(totalShares)} />
            <Metric
              label="Total capital raised"
              value={fmtM(totalCapitalRaised)}
              sub={`$${fmtMoney(totalPaidIn)} paid-in + ${fmtM(totalFunded)} funded`}
            />
            <SharePriceMetric
              currentPrice={currentPrice}
              onChange={setCurrentPrice}
              marketCap={marketCap}
            />
          </div>
          <div className="grid grid-cols-4 divide-x divide-zinc-100 bg-zinc-50/60">
            <Metric label="Capital raises" value={String(raises.length)} small />
            <Metric label="Total raise target" value={fmtM(totalRaiseTarget)} small />
            <Metric label="Total committed" value={fmtM(totalCommitted)} small />
            <Metric label="Total funded" value={fmtM(totalFunded)} small />
          </div>
        </div>
      )}
      {internalTab === "value-growth" && (
        <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
          <Metric label="Shareholders" value={String(shareholders.length)} />
          <Metric label="Founding shares" value={fmt(totalShares)} />
          <Metric label="Total paid-in capital" value={`$${fmtMoney(totalPaidIn)}`} />
          <SharePriceMetric
            currentPrice={currentPrice}
            onChange={setCurrentPrice}
            marketCap={marketCap}
          />
        </div>
      )}
      {internalTab === "market-test" && (
        <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
          <Metric label="Capital raises" value={String(raises.length)} />
          <Metric label="Total shares on issue" value={fmt(totalShares)} />
          <Metric label="Total paid-in capital" value={`$${fmtMoney(totalPaidIn)}`} />
          <SharePriceMetric
            currentPrice={currentPrice}
            onChange={setCurrentPrice}
            marketCap={marketCap}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {internalTab === "overview" && (
          <OverviewView
            scenarioId={scenarioId}
            shareholders={shareholders}
            currentPriceNum={currentPriceNum}
            totalShares={totalShares}
          />
        )}
        {internalTab === "combined" && (
          <CombinedView
            scenarioId={scenarioId}
            shareholders={shareholders}
            raises={raises}
            currentPriceNum={currentPriceNum}
            totalShares={totalShares}
          />
        )}
        {internalTab === "value-growth" && (
          <ValueGrowthView
            shareholders={shareholders}
            raises={raises}
            valuation={valuation}
            firstCalendarYear={firstCalendarYear}
            currentPriceNum={currentPriceNum}
            totalShares={totalShares}
            esopPctByYear={esopPctByYear}
            earnBackPctByYear={earnBackPctByYear}
            onSaveOptionPools={saveOptionPools}
          />
        )}
        {internalTab === "market-test" && (
          <MarketTestView
            scenarioId={scenarioId}
            raises={raises}
            shareholders={shareholders}
            valuation={valuation}
            firstCalendarYear={firstCalendarYear}
          />
        )}
      </div>
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function OverviewView({
  scenarioId,
  shareholders,
  currentPriceNum,
  totalShares,
}: {
  scenarioId: string;
  shareholders: ShareholderRow[];
  currentPriceNum: number;
  totalShares: number;
}) {
  const [chartMode, setChartMode] = useState<ChartMode>("holder");
  const [, startDeleteTransition] = useTransition();

  const sorted = [...shareholders].sort((a, b) => b.shares - a.shares);
  const totalPaidIn = shareholders.reduce((s, r) => s + r.shares * Number(r.pricePerShare), 0);
  const marketCap = totalShares * currentPriceNum;

  const holderChartData = (() => {
    const top = sorted.slice(0, 10);
    const rest = sorted.slice(10);
    const data = top.map((r, i) => ({
      name: r.name,
      value: r.shares,
      color: CHART_PALETTE[i % CHART_PALETTE.length],
    }));
    if (rest.length > 0)
      data.push({
        name: `Others (${rest.length})`,
        value: rest.reduce((s, r) => s + r.shares, 0),
        color: "#d1d5db",
      });
    return data;
  })();

  const classChartData = (() => {
    const byClass: Record<string, number> = {};
    for (const r of shareholders) byClass[r.shareClass] = (byClass[r.shareClass] ?? 0) + r.shares;
    return Object.entries(byClass)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value], i) => ({
        name,
        value,
        color: CLASS_COLORS[name] ?? CHART_PALETTE[i % CHART_PALETTE.length],
      }));
  })();

  const chartData = chartMode === "holder" ? holderChartData : classChartData;

  function handleDelete(id: string) {
    if (!confirm("Remove this shareholder? This cannot be undone.")) return;
    startDeleteTransition(async () => {
      await deleteShareholder(scenarioId, id);
    });
  }

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-auto">
        {shareholders.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
            No shareholders yet — click Add shareholder to begin.
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-50">
              <tr className="border-b border-zinc-200">
                {[
                  "#",
                  "Name",
                  "Entity / Trust",
                  "Held",
                  "Class",
                  "Shares",
                  "% Holding",
                  "Issue $",
                  "Curr. Value",
                  "Date Issued",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 ${["Shares", "% Holding", "Issue $", "Curr. Value", "Date Issued"].includes(h) ? "text-right" : h === "Held" ? "text-center" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map((r, idx) => {
                const pct = totalShares > 0 ? (r.shares / totalShares) * 100 : 0;
                const currValue = r.shares * currentPriceNum;
                return (
                  <tr key={r._id} className="group hover:bg-zinc-50">
                    <td className="px-3 py-2 text-zinc-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium text-zinc-900">{r.name}</td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-zinc-500">
                      {r.entityTrust ?? <span className="italic text-zinc-300">same as name</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.beneficiallyHeld ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                      >
                        {r.beneficiallyHeld ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLASS_BADGE[r.shareClass] ?? "bg-zinc-100 text-zinc-700"}`}
                      >
                        {r.shareClass}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-800">
                      {fmt(r.shares)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                      {fmtPct(pct)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                      ${Number(r.pricePerShare).toFixed(3)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium text-zinc-900">
                      ${fmtMoney(currValue)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {r.dateOfIssue.slice(0, 10)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <AddShareholderModal
                          saveAction={(payload) => updateShareholder(scenarioId, r._id, payload)}
                          initial={{
                            _id: r._id,
                            name: r.name,
                            entityTrust: r.entityTrust,
                            shareClass: r.shareClass,
                            shares: String(r.shares),
                            pricePerShare: r.pricePerShare,
                            beneficiallyHeld: r.beneficiallyHeld,
                            dateOfIssue: r.dateOfIssue.slice(0, 10),
                          }}
                          trigger={
                            <span className="cursor-pointer rounded px-2 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100">
                              Edit
                            </span>
                          }
                        />
                        <button
                          type="button"
                          onClick={() => handleDelete(r._id)}
                          className="rounded px-2 py-0.5 text-[10px] text-rose-500 hover:bg-rose-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-semibold">
                <td colSpan={5} className="px-3 py-2 text-xs text-zinc-700">
                  Total
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-900">
                  {fmt(totalShares)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-700">100.00%</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-900">
                  ${fmtMoney(totalPaidIn)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-xs text-zinc-900">
                  ${fmtMoney(marketCap)}
                </td>
                <td colSpan={2} className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Chart panel */}
      {shareholders.length > 0 && (
        <div className="w-[300px] flex-shrink-0 border-l border-zinc-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Ownership
            </span>
            <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
              {(
                [
                  { key: "holder", label: "By holder" },
                  { key: "class", label: "By class" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setChartMode(opt.key)}
                  className={[
                    "rounded px-2 py-0.5 text-[10px] font-medium transition",
                    chartMode === opt.key
                      ? "bg-white text-zinc-900 shadow"
                      : "text-zinc-600 hover:text-zinc-900",
                  ].join(" ")}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, name) => {
                  const n = Number(value ?? 0);
                  return [`${fmt(n)} shares (${fmtPct((n / totalShares) * 100)})`, String(name)];
                }}
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-col gap-1">
            {chartData.map((entry, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ background: entry.color }}
                />
                <span className="flex-1 truncate text-[10px] text-zinc-600">{entry.name}</span>
                <span className="text-[10px] tabular-nums text-zinc-400">
                  {fmtPct((entry.value / totalShares) * 100)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Combined tab ──────────────────────────────────────────────────────────────

function CombinedView({
  scenarioId: _scenarioId,
  shareholders,
  raises,
  currentPriceNum,
  totalShares,
}: {
  scenarioId: string;
  shareholders: ShareholderRow[];
  raises: CapitalRaiseRow[];
  currentPriceNum: number;
  totalShares: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(["__shareholders__", ...raises.map((r) => r._id)]),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const sorted = [...shareholders].sort((a, b) => b.shares - a.shares);
  const totalPaidIn = shareholders.reduce((s, r) => s + r.shares * Number(r.pricePerShare), 0);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        {/* Share register section */}
        <Section
          id="__shareholders__"
          expanded={expanded.has("__shareholders__")}
          onToggle={() => toggle("__shareholders__")}
          title="Share Register"
          badge={{ label: "Equity", tone: "violet" }}
          chips={[
            `${shareholders.length} shareholders`,
            `${fmt(totalShares)} shares`,
            `${fmtM(totalPaidIn)} paid-in`,
            `${fmtM(totalShares * currentPriceNum)} @ $${currentPriceNum.toFixed(2)}`,
          ]}
        >
          <table className="w-full border-collapse text-xs">
            <thead className="bg-zinc-50/80">
              <tr className="border-b border-zinc-200">
                <th className="pl-10 pr-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  #
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Entity / Trust
                </th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Held
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Class
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Shares
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  % Holding
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Issue $
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Paid-in
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Curr. Value
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {sorted.map((r, idx) => {
                const pct = totalShares > 0 ? (r.shares / totalShares) * 100 : 0;
                return (
                  <tr key={r._id} className="hover:bg-zinc-50/60">
                    <td className="pl-10 pr-3 py-1.5 text-zinc-400">{idx + 1}</td>
                    <td className="px-3 py-1.5 font-medium text-zinc-900">{r.name}</td>
                    <td className="max-w-[180px] truncate px-3 py-1.5 text-zinc-500">
                      {r.entityTrust ?? <span className="italic text-zinc-300">same as name</span>}
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.beneficiallyHeld ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                      >
                        {r.beneficiallyHeld ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CLASS_BADGE[r.shareClass] ?? "bg-zinc-100 text-zinc-700"}`}
                      >
                        {r.shareClass}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-800">
                      {fmt(r.shares)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                      {fmtPct(pct)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-600">
                      ${Number(r.pricePerShare).toFixed(3)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-zinc-800">
                      ${fmtMoney(r.shares * Number(r.pricePerShare))}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-zinc-900">
                      ${fmtMoney(r.shares * currentPriceNum)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-zinc-500">
                      {r.dateOfIssue.slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
                <td colSpan={5} className="pl-10 pr-3 py-1.5 text-xs text-zinc-700">
                  Total
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-900">
                  {fmt(totalShares)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-600">
                  100.00%
                </td>
                <td className="px-3 py-1.5" />
                <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-900">
                  ${fmtMoney(totalPaidIn)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-900">
                  ${fmtMoney(totalShares * currentPriceNum)}
                </td>
                <td className="px-3 py-1.5" />
              </tr>
            </tfoot>
          </table>
        </Section>

        {/* One section per capital raise */}
        {raises.map((raise) => {
          const activeInvestors = raise.investors.filter((i) => i.status !== "withdrawn");
          const committed = activeInvestors.reduce((s, i) => s + Number(i.commitment), 0);
          const funded = raise.investors
            .filter((i) => i.status === "funded")
            .reduce((s, i) => s + Number(i.commitment), 0);
          const ppu = raise.pricePerUnit ? Number(raise.pricePerUnit) : null;

          return (
            <Section
              key={raise._id}
              id={raise._id}
              expanded={expanded.has(raise._id)}
              onToggle={() => toggle(raise._id)}
              title={raise.name}
              badge={{
                label: raise.type === "equity" ? "Equity" : "Conv. Note",
                tone: raise.type === "equity" ? "blue" : "amber",
              }}
              chips={
                [
                  `${raise.investors.length} investor${raise.investors.length !== 1 ? "s" : ""}`,
                  `${fmtM(Number(raise.targetSize))} target`,
                  `${fmtM(committed)} committed`,
                  funded > 0 ? `${fmtM(funded)} funded` : null,
                  ppu ? `$${ppu.toFixed(3)}/unit` : null,
                  raise.raiseDate.slice(0, 10),
                ].filter(Boolean) as string[]
              }
            >
              <RaiseInvestorTable investors={raise.investors} committed={committed} />
            </Section>
          );
        })}

        {raises.length === 0 && shareholders.length === 0 && (
          <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
            No data yet — add shareholders or capital raises.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Section component (collapsible) ──────────────────────────────────────────

type BadgeTone = "violet" | "blue" | "amber" | "emerald";
const BADGE_TONE: Record<BadgeTone, string> = {
  violet: "bg-violet-100 text-violet-800",
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-800",
  emerald: "bg-emerald-100 text-emerald-700",
};

function Section({
  expanded,
  onToggle,
  title,
  badge,
  chips,
  children,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  title: string;
  badge: { label: string; tone: BadgeTone };
  chips: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-zinc-200">
      {/* Section header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-zinc-50 px-4 py-2.5 text-left hover:bg-zinc-100 transition-colors"
      >
        {/* Chevron */}
        <svg
          aria-hidden="true"
          className={`h-3.5 w-3.5 flex-shrink-0 text-zinc-400 transition-transform ${expanded ? "rotate-90" : ""}`}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path
            d="M6 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Type badge */}
        <span
          className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_TONE[badge.tone]}`}
        >
          {badge.label}
        </span>

        {/* Title */}
        <span className="text-xs font-semibold text-zinc-800">{title}</span>

        {/* Summary chips */}
        <div className="ml-2 flex flex-wrap items-center gap-1.5">
          {chips.map((chip, i) => (
            <span
              key={i}
              className="rounded bg-white px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-200"
            >
              {chip}
            </span>
          ))}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && <div className="border-t border-zinc-100">{children}</div>}
    </div>
  );
}

// ── Raise investor sub-table ──────────────────────────────────────────────────

function RaiseInvestorTable({
  investors,
  committed,
}: {
  investors: InvestorRow[];
  committed: number;
}) {
  const sorted = [...investors].sort((a, b) => Number(b.commitment) - Number(a.commitment));

  if (investors.length === 0) {
    return (
      <div className="px-10 py-4 text-[11px] text-zinc-400 italic">No investors on this raise.</div>
    );
  }

  return (
    <table className="w-full border-collapse text-xs">
      <thead className="bg-zinc-50/80">
        <tr className="border-b border-zinc-200">
          <th className="pl-10 pr-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            #
          </th>
          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Investor
          </th>
          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Commitment
          </th>
          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            % of raise
          </th>
          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Status
          </th>
          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Funding date
          </th>
          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
            Notes
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-100">
        {sorted.map((inv, idx) => {
          const pct = committed > 0 ? (Number(inv.commitment) / committed) * 100 : 0;
          return (
            <tr key={inv._id} className="hover:bg-zinc-50/60">
              <td className="pl-10 pr-3 py-1.5 text-zinc-400">{idx + 1}</td>
              <td className="px-3 py-1.5 font-medium text-zinc-900">{inv.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-800">
                ${fmtMoney(Number(inv.commitment))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-zinc-500">
                {inv.status !== "withdrawn" ? fmtPct(pct) : "—"}
              </td>
              <td className="px-3 py-1.5 text-center">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[inv.status] ?? "bg-zinc-100 text-zinc-600"}`}
                >
                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right font-mono text-zinc-500">
                {inv.fundingDate.slice(0, 10)}
              </td>
              <td className="px-3 py-1.5 text-zinc-400 italic">{inv.notes ?? ""}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-zinc-200 bg-zinc-50 font-semibold">
          <td colSpan={2} className="pl-10 pr-3 py-1.5 text-xs text-zinc-700">
            {investors.filter((i) => i.status !== "withdrawn").length} active investors
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-900">
            ${fmtMoney(committed)}
          </td>
          <td className="px-3 py-1.5 text-right tabular-nums text-xs text-zinc-600">100.00%</td>
          <td colSpan={3} className="px-3 py-1.5" />
        </tr>
      </tfoot>
    </table>
  );
}

// ── Value Growth tab ─────────────────────────────────────────────────────────

const MODEL_LABELS: Record<ValModel, string> = {
  dcf: "DCF",
  "ev-ebitda": "EV / EBITDA",
  "ev-revenue": "EV / Revenue",
  pe: "P/E",
  pb: "P/B",
};

function ValueGrowthView({
  shareholders,
  raises,
  valuation,
  firstCalendarYear,
  currentPriceNum,
  totalShares,
  esopPctByYear,
  earnBackPctByYear,
  onSaveOptionPools,
}: {
  shareholders: ShareholderRow[];
  raises: CapitalRaiseRow[];
  valuation: ValuationData | null;
  firstCalendarYear: number;
  currentPriceNum: number;
  totalShares: number;
  esopPctByYear: number[];
  earnBackPctByYear: number[];
  onSaveOptionPools: (esop: number[], earnBack: number[]) => void;
}) {
  const [model, setModel] = useState<ValModel>("dcf");
  const [showAllShareholders, setShowAllShareholders] = useState(false);
  const [showEsopModal, setShowEsopModal] = useState(false);
  const [showEarnBackModal, setShowEarnBackModal] = useState(false);

  if (!valuation) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
        No valuation data — configure assumptions on the Valuation tab first.
      </div>
    );
  }

  // Year columns — 5 CY years starting from firstCalendarYear
  const years = Array.from({ length: 5 }, (_, i) => ({
    idx: i,
    year: i + 1,
    cy: firstCalendarYear + i,
    fy: firstCalendarYear + i + 1,
  }));

  // Equity value per year from the selected model.
  // DCF rows index by horizonYears (1–5). Multiple rows index by CY (2026–2030) — the
  // ValuationMultipleRow.fy field stores the calendar year, not the fiscal year.
  function getEquityValue(y: (typeof years)[0]): number | null {
    if (model === "dcf") {
      const row = valuation!.dcf.find((r) => r.horizonYears === y.year);
      if (!row || row.invalidReason) return null;
      return Number(row.equityValue);
    }
    if (model === "pb") {
      const rows = valuation!.pb;
      const row = rows.find((r) => r.fy === y.cy);
      const ev = row ? Number(row.equityValue) : null;
      return ev !== null && ev > 0 ? ev : null;
    }
    const rows =
      model === "ev-ebitda"
        ? valuation!.evEbitda
        : model === "ev-revenue"
          ? valuation!.evRevenue
          : valuation!.pe;
    const row = rows.find((r) => r.fy === y.cy);
    const ev = row ? Number(row.equityValue) : null;
    // Negative equity value (e.g. negative EBITDA) is not meaningful — treat as unavailable
    return ev !== null && ev > 0 ? ev : null;
  }

  // Capital structure — equity raises add new shares at their pricePerUnit
  // Allocated to the CY in which the raiseDate falls
  const newEquitySharesPerYear: number[] = years.map(({ cy }) =>
    raises
      .filter((r) => r.type === "equity" && r.pricePerUnit)
      .reduce((s, r) => {
        const fy = new Date(r.raiseDate).getFullYear();
        if (fy !== cy) return s;
        const ppu = Number(r.pricePerUnit);
        if (!ppu) return s;
        return (
          s +
          r.investors
            .filter((i) => i.status === "funded")
            .reduce((a, i) => a + Math.round(Number(i.commitment) / ppu), 0)
        );
      }, 0),
  );

  // Closing shares accumulate year over year
  let runningShares = totalShares;
  const closingSharesPerYear = newEquitySharesPerYear.map((n) => {
    runningShares += n;
    return runningShares;
  });
  const openingSharesPerYear = [totalShares, ...closingSharesPerYear.slice(0, -1)];

  // Options: ESOP + Management earn back as % of issued shares at that year's close
  const newOptionsPerYear = years.map(({ idx }) => {
    const base = openingSharesPerYear[idx];
    const esopN = Math.ceil((base * (esopPctByYear[idx] ?? 0)) / 100);
    const earnN = Math.ceil((base * (earnBackPctByYear[idx] ?? 0)) / 100);
    return esopN + earnN;
  });
  let runningOptions = 0;
  const cumulativeOptionsPerYear = newOptionsPerYear.map((n) => {
    runningOptions += n;
    return runningOptions;
  });
  const hasOptions = cumulativeOptionsPerYear.some((n) => n > 0);
  // FDSO = issued shares + all unexercised options (fully-diluted basis)
  const fdsoPerYear = closingSharesPerYear.map((s, i) => s + cumulativeOptionsPerYear[i]);

  const equityValues = years.map(getEquityValue);
  // Use FDSO when options exist — diluted per-share is the conservative figure
  const perShareValues = equityValues.map((ev, i) =>
    ev !== null && fdsoPerYear[i] > 0 ? ev / fdsoPerYear[i] : null,
  );
  const pctVsCurrent = perShareValues.map((psv) =>
    psv !== null && currentPriceNum > 0 ? ((psv - currentPriceNum) / currentPriceNum) * 100 : null,
  );

  // Sort shareholders for the holder value table
  const sortedShareholders = [...shareholders].sort((a, b) => b.shares - a.shares);
  const visibleShareholders =
    showAllShareholders || sortedShareholders.length <= 5
      ? sortedShareholders
      : sortedShareholders.slice(0, 5);

  const COL = "w-28 min-w-[7rem] px-3 py-2 text-right tabular-nums";
  const HDR =
    "w-28 min-w-[7rem] px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400";
  const ROW_LABEL =
    "sticky left-0 bg-white px-3 py-2 text-xs font-medium text-zinc-700 min-w-[180px]";
  const SUB_LABEL =
    "sticky left-0 bg-zinc-50/60 px-3 py-1.5 pl-6 text-[11px] text-zinc-500 min-w-[180px]";

  function psvCell(psv: number | null, key: number) {
    if (psv === null)
      return (
        <td key={key} className={`${COL} text-zinc-300`}>
          —
        </td>
      );
    return (
      <td key={key} className={`${COL} text-zinc-900`}>
        ${psv.toFixed(3)}
      </td>
    );
  }

  function holderValueCell(shares: number, psv: number | null, key: number) {
    if (psv === null)
      return (
        <td key={key} className={`${COL} text-zinc-300`}>
          —
        </td>
      );
    return (
      <td key={key} className={`${COL} text-zinc-800`}>
        {fmtM(shares * psv)}
      </td>
    );
  }

  // Conv note conversion price = min(pricePerUnit, cap/shares, ppu×(1−discount))
  function conversionPrice(
    raise: CapitalRaiseRow,
    psv: number | null,
    closingShares: number,
  ): number | null {
    const candidates: number[] = [];
    if (raise.pricePerUnit) candidates.push(Number(raise.pricePerUnit));
    if (raise.valuationCap && closingShares > 0)
      candidates.push(Number(raise.valuationCap) / closingShares);
    if (raise.discountPct && psv !== null && psv > 0)
      candidates.push(psv * (1 - Number(raise.discountPct) / 100));
    return candidates.length > 0 ? Math.min(...candidates) : null;
  }

  function convNoteCell(
    raise: CapitalRaiseRow,
    commitment: number,
    psv: number | null,
    closingShares: number,
    key: number,
  ) {
    const cp = conversionPrice(raise, psv, closingShares);
    if (cp === null || cp <= 0 || psv === null) {
      // No conversion data — show face value as amber
      return (
        <td key={key} className={`${COL} text-amber-600`}>
          {fmtM(commitment)}
        </td>
      );
    }
    const convertedShares = commitment / cp;
    const value = convertedShares * psv;
    return (
      <td key={key} className={`${COL} text-emerald-700`}>
        {fmtM(value)}
      </td>
    );
  }

  function equityRaiseValueCell(
    funded: number,
    ppu: number | null,
    psv: number | null,
    key: number,
  ) {
    if (!ppu || psv === null)
      return (
        <td key={key} className={`${COL} text-zinc-300`}>
          —
        </td>
      );
    const units = funded / ppu;
    return (
      <td key={key} className={`${COL} text-blue-700`}>
        {fmtM(units * psv)}
      </td>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Model switcher */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mr-1">
          Valuation model
        </span>
        <div className="flex gap-1 rounded-md bg-zinc-100 p-0.5">
          {(Object.keys(MODEL_LABELS) as ValModel[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModel(m)}
              className={[
                "rounded px-3 py-1 text-[11px] font-medium transition",
                model === m ? "bg-white text-zinc-900 shadow" : "text-zinc-500 hover:text-zinc-800",
              ].join(" ")}
            >
              {MODEL_LABELS[m]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEsopModal(true)}
            className={[
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
              esopPctByYear.some((v) => v > 0)
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
            ].join(" ")}
          >
            <span>ESOP</span>
            {esopPctByYear.some((v) => v > 0) && (
              <span className="rounded-full bg-indigo-200 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-800">
                {fmt(
                  newOptionsPerYear.reduce(
                    (s, _v, i) =>
                      s + Math.ceil((openingSharesPerYear[i] * (esopPctByYear[i] ?? 0)) / 100),
                    0,
                  ),
                )}{" "}
                opts
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowEarnBackModal(true)}
            className={[
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition",
              earnBackPctByYear.some((v) => v > 0)
                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
            ].join(" ")}
          >
            <span>Mgmt Earn Back</span>
            {earnBackPctByYear.some((v) => v > 0) && (
              <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                {fmt(
                  newOptionsPerYear.reduce(
                    (s, _v, i) =>
                      s + Math.ceil((openingSharesPerYear[i] * (earnBackPctByYear[i] ?? 0)) / 100),
                    0,
                  ),
                )}{" "}
                opts
              </span>
            )}
          </button>
          <span className="text-[10px] text-zinc-400">
            CY{firstCalendarYear}–CY{firstCalendarYear + 4}
          </span>
        </div>
      </div>

      {/* ESOP Modal */}
      {showEsopModal && (
        <OptionsYearModal
          title="ESOP Options"
          description="Enter a % of issued shares to grant as ESOP options each year. Option counts are computed automatically and dilute the per-share value."
          accentColor="indigo"
          pcts={esopPctByYear}
          baseSharesPerYear={openingSharesPerYear}
          years={years}
          onSave={(pcts) => {
            onSaveOptionPools(pcts, earnBackPctByYear);
            setShowEsopModal(false);
          }}
          onClose={() => setShowEsopModal(false)}
        />
      )}

      {/* Management Earn Back Modal */}
      {showEarnBackModal && (
        <OptionsYearModal
          title="Management Earn Back"
          description="Enter a % of issued shares available to management as performance earn-back options each year. Included in the fully-diluted share count."
          accentColor="amber"
          pcts={earnBackPctByYear}
          baseSharesPerYear={openingSharesPerYear}
          years={years}
          onSave={(pcts) => {
            onSaveOptionPools(esopPctByYear, pcts);
            setShowEarnBackModal(false);
          }}
          onClose={() => setShowEarnBackModal(false)}
        />
      )}

      <table className="border-collapse text-xs" style={{ minWidth: "700px" }}>
        {/* Column headers */}
        <thead className="sticky top-[38px] z-10 bg-white">
          <tr className="border-b border-zinc-200">
            <th className="sticky left-0 bg-white px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400 min-w-[180px]" />
            {years.map(({ cy, year }) => (
              <th key={cy} className={HDR}>
                Year {year}
                <br />
                <span className="font-normal normal-case tracking-normal">CY{cy}</span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* ── Capital structure ──────────────────────────────── */}
          <tr className="bg-zinc-50 border-t border-zinc-200">
            <td
              colSpan={6}
              className="sticky left-0 bg-zinc-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500"
            >
              Capital Structure
            </td>
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>Opening shares</td>
            {openingSharesPerYear.map((n, i) => (
              <td key={i} className={`${COL} text-zinc-700`}>
                {fmt(n)}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>New equity shares issued</td>
            {newEquitySharesPerYear.map((n, i) => (
              <td
                key={i}
                className={`${COL} ${n > 0 ? "text-blue-700 font-medium" : "text-zinc-300"}`}
              >
                {n > 0 ? `+${fmt(n)}` : "—"}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={`${ROW_LABEL} flex items-center gap-1.5`}>
              New options issued
              {hasOptions && (
                <span className="rounded bg-indigo-100 px-1 py-0.5 text-[9px] font-semibold text-indigo-700">
                  ESOP + Earn Back
                </span>
              )}
            </td>
            {newOptionsPerYear.map((n, i) => (
              <td
                key={i}
                className={`${COL} ${n > 0 ? "text-indigo-700 font-medium" : "text-zinc-300"}`}
              >
                {n > 0 ? `+${fmt(n)}` : "—"}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>Current unexercised options</td>
            {cumulativeOptionsPerYear.map((n, i) => (
              <td key={i} className={`${COL} ${n > 0 ? "text-indigo-600" : "text-zinc-300"}`}>
                {n > 0 ? fmt(n) : "—"}
              </td>
            ))}
          </tr>
          <tr className="border-b-2 border-zinc-200 bg-zinc-50 font-semibold">
            <td className="sticky left-0 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 min-w-[180px]">
              {hasOptions ? "FDSO (fully diluted)" : "Closing total shares"}
            </td>
            {fdsoPerYear.map((n, i) => (
              <td key={i} className={`${COL} text-zinc-900`}>
                {fmt(n)}
              </td>
            ))}
          </tr>

          {/* ── Valuation bridge ───────────────────────────────── */}
          <tr className="bg-zinc-50 border-t border-zinc-200">
            <td
              colSpan={6}
              className="sticky left-0 bg-zinc-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500"
            >
              Valuation Bridge · {MODEL_LABELS[model]}
            </td>
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>Equity value</td>
            {equityValues.map((ev, i) => (
              <td
                key={i}
                className={`${COL} ${ev !== null ? "text-zinc-900 font-medium" : "text-zinc-300"}`}
              >
                {ev !== null ? fmtM(ev) : "—"}
              </td>
            ))}
          </tr>
          <tr className="border-b border-zinc-100 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>
              Per share value
              {hasOptions && (
                <span className="ml-1.5 text-[9px] font-semibold text-indigo-600">(diluted)</span>
              )}
            </td>
            {perShareValues.map((psv, i) => psvCell(psv, i))}
          </tr>
          <tr className="border-b-2 border-zinc-200 hover:bg-zinc-50/40">
            <td className={ROW_LABEL}>vs. current price ${currentPriceNum.toFixed(2)}</td>
            {pctVsCurrent.map((pct, i) => {
              if (pct === null)
                return (
                  <td key={i} className={`${COL} text-zinc-300`}>
                    —
                  </td>
                );
              const pos = pct >= 0;
              return (
                <td
                  key={i}
                  className={`${COL} font-medium ${pos ? "text-emerald-600" : "text-rose-600"}`}
                >
                  {pos ? "+" : ""}
                  {pct.toFixed(1)}%
                </td>
              );
            })}
          </tr>

          {/* ── Holder value table ─────────────────────────────── */}
          <tr className="bg-zinc-50 border-t border-zinc-200">
            <td
              colSpan={6}
              className="sticky left-0 bg-zinc-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500"
            >
              Value of Holdings
            </td>
          </tr>

          {/* Share register holders */}
          <tr className="bg-violet-50/40 border-b border-zinc-100">
            <td
              colSpan={6}
              className="sticky left-0 bg-violet-50/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-700"
            >
              Share Register ({shareholders.length} shareholders)
            </td>
          </tr>
          {visibleShareholders.map((r) => (
            <tr key={r._id} className="border-b border-zinc-100 hover:bg-zinc-50/40">
              <td className={`${SUB_LABEL} bg-white`}>
                <span className="font-medium text-zinc-800">{r.name}</span>
                <span className="ml-1.5 text-zinc-400">({fmt(r.shares)} shares)</span>
              </td>
              {perShareValues.map((psv, i) => holderValueCell(r.shares, psv, i))}
            </tr>
          ))}
          {sortedShareholders.length > 5 && (
            <tr className="border-b border-zinc-100">
              <td colSpan={6} className="px-6 py-1.5">
                <button
                  type="button"
                  onClick={() => setShowAllShareholders((v) => !v)}
                  className="text-[11px] text-zinc-500 underline hover:text-zinc-800"
                >
                  {showAllShareholders
                    ? "Show top 5 only"
                    : `Show all ${sortedShareholders.length} shareholders`}
                </button>
              </td>
            </tr>
          )}
          {/* Totals row for share register */}
          <tr className="border-b-2 border-zinc-200 bg-violet-50/20 font-semibold">
            <td className={`${SUB_LABEL} bg-violet-50/20 font-semibold text-zinc-700`}>
              Share register total
            </td>
            {perShareValues.map((psv, i) => holderValueCell(totalShares, psv, i))}
          </tr>

          {/* Capital raises */}
          {raises.map((raise) => {
            const funded = raise.investors
              .filter((i) => i.status === "funded")
              .reduce((s, i) => s + Number(i.commitment), 0);
            if (funded === 0) return null;
            const isConvNote = raise.type === "convertible_note";
            const ppu = raise.pricePerUnit ? Number(raise.pricePerUnit) : null;
            // For conv notes: use year 1 per-share value to estimate conversion price for label
            const samplePsv = perShareValues[0];
            const sampleCp = isConvNote
              ? conversionPrice(raise, samplePsv, closingSharesPerYear[0])
              : null;
            const hasConversionData = sampleCp !== null && sampleCp > 0;
            return (
              <React.Fragment key={raise._id}>
                <tr
                  className={`border-b border-zinc-100 ${isConvNote ? (hasConversionData ? "bg-emerald-50/30" : "bg-amber-50/30") : "bg-blue-50/30"}`}
                >
                  <td
                    colSpan={6}
                    className={`sticky left-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${isConvNote ? (hasConversionData ? "bg-emerald-50/30 text-emerald-700" : "bg-amber-50/30 text-amber-700") : "bg-blue-50/30 text-blue-700"}`}
                  >
                    {raise.name} ·{" "}
                    {isConvNote
                      ? `Conv. Note → Equity${hasConversionData ? " (converted)" : " (face value)"}`
                      : "Equity"}{" "}
                    · {fmtM(funded)} funded
                  </td>
                </tr>
                {raise.investors
                  .filter((i) => i.status === "funded")
                  .sort((a, b) => Number(b.commitment) - Number(a.commitment))
                  .map((inv) => {
                    // Show how many shares this investor gets at year-1 conversion price
                    const convShares =
                      isConvNote && sampleCp && sampleCp > 0
                        ? Math.round(Number(inv.commitment) / sampleCp)
                        : null;
                    return (
                      <tr
                        key={`${raise._id}-${inv._id}`}
                        className="border-b border-zinc-100 hover:bg-zinc-50/40"
                      >
                        <td className={`${SUB_LABEL} bg-white`}>
                          <span className="font-medium text-zinc-800">{inv.name}</span>
                          <span className="ml-1.5 text-zinc-400">
                            {isConvNote
                              ? convShares
                                ? `~${fmt(convShares)} shares @ $${sampleCp!.toFixed(3)}/sh`
                                : `$${fmtMoney(Number(inv.commitment))} face`
                              : ppu
                                ? `${fmt(Math.round(Number(inv.commitment) / ppu))} shares`
                                : `$${fmtMoney(Number(inv.commitment))}`}
                          </span>
                        </td>
                        {years.map(({ idx }) =>
                          isConvNote
                            ? convNoteCell(
                                raise,
                                Number(inv.commitment),
                                perShareValues[idx],
                                closingSharesPerYear[idx],
                                idx,
                              )
                            : equityRaiseValueCell(
                                Number(inv.commitment),
                                ppu,
                                perShareValues[idx],
                                idx,
                              ),
                        )}
                      </tr>
                    );
                  })}
                <tr
                  className={`border-b-2 border-zinc-200 font-semibold ${isConvNote ? (hasConversionData ? "bg-emerald-50/20" : "bg-amber-50/20") : "bg-blue-50/20"}`}
                >
                  <td
                    className={`sticky left-0 px-3 py-2 pl-6 text-[11px] font-semibold min-w-[180px] ${isConvNote ? (hasConversionData ? "bg-emerald-50/20 text-zinc-700" : "bg-amber-50/20 text-zinc-700") : "bg-blue-50/20 text-zinc-700"}`}
                  >
                    {raise.name} total
                  </td>
                  {years.map(({ idx }) =>
                    isConvNote
                      ? convNoteCell(
                          raise,
                          funded,
                          perShareValues[idx],
                          closingSharesPerYear[idx],
                          idx,
                        )
                      : equityRaiseValueCell(funded, ppu, perShareValues[idx], idx),
                  )}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Options year modal ────────────────────────────────────────────────────────

type AccentColor = "indigo" | "amber";
const ACCENT: Record<AccentColor, { btn: string; ring: string; label: string }> = {
  indigo: {
    btn: "bg-indigo-600 hover:bg-indigo-700 text-white",
    ring: "focus:ring-indigo-300",
    label: "text-indigo-700",
  },
  amber: {
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
    ring: "focus:ring-amber-300",
    label: "text-amber-700",
  },
};

function OptionsYearModal({
  title,
  description,
  accentColor,
  pcts,
  baseSharesPerYear,
  years,
  onSave,
  onClose,
}: {
  title: string;
  description: string;
  accentColor: AccentColor;
  pcts: number[];
  baseSharesPerYear: number[];
  years: { year: number; cy: number }[];
  onSave: (pcts: number[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<string[]>(pcts.map((v) => (v === 0 ? "" : String(v))));
  const accent = ACCENT[accentColor];

  function update(i: number, raw: string) {
    setDraft((prev) => prev.map((v, j) => (j === i ? raw : v)));
  }

  function parsePct(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function handleSave() {
    onSave(draft.map(parsePct));
  }

  const computedOptions = draft.map((v, i) =>
    Math.ceil((baseSharesPerYear[i] * parsePct(v)) / 100),
  );
  const totalOptions = computedOptions.reduce((s, n) => s + n, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{description}</p>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_100px_100px] gap-x-3 border-b border-zinc-100 px-5 py-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          <span>Year</span>
          <span className="text-right">% of shares</span>
          <span className="text-right">≈ options</span>
        </div>

        {/* Year rows */}
        <div className="px-5 py-3">
          <div className="flex flex-col gap-2.5">
            {years.map(({ year, cy }, i) => (
              <div key={cy} className="grid grid-cols-[1fr_100px_100px] items-center gap-x-3">
                <span className={`text-xs font-medium ${accent.label}`}>
                  Year {year} · CY{cy}
                </span>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={draft[i]}
                    onChange={(e) => update(i, e.target.value)}
                    className={`w-full rounded-md border border-zinc-200 py-1.5 pl-2 pr-6 text-right text-xs tabular-nums focus:border-transparent focus:outline-none focus:ring-2 ${accent.ring}`}
                    placeholder="0"
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
                    %
                  </span>
                </div>
                <span className="text-right text-xs tabular-nums text-zinc-500">
                  {computedOptions[i] > 0 ? (
                    fmt(computedOptions[i])
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          <div className="mt-4 grid grid-cols-[1fr_100px_100px] gap-x-3 rounded-md bg-zinc-50 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Total
            </span>
            <span />
            <span className="text-right text-sm font-semibold tabular-nums text-zinc-900">
              {totalOptions > 0 ? fmt(totalOptions) : "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-zinc-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`flex-1 rounded-lg px-4 py-2 text-xs font-medium ${accent.btn}`}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Shared ────────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  sub,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className={`font-semibold tabular-nums text-zinc-900 ${small ? "text-xs" : "text-sm"}`}>
        {value}
      </span>
      {sub && <span className="text-[10px] text-zinc-400">{sub}</span>}
    </div>
  );
}

function SharePriceMetric({
  currentPrice,
  onChange,
  marketCap,
}: {
  currentPrice: string;
  onChange: (v: string) => void;
  marketCap: number;
}) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        Current share price
      </span>
      <div className="flex items-center gap-1">
        <span className="text-[11px] text-zinc-500">$</span>
        <input
          type="number"
          min={0}
          step={0.01}
          value={currentPrice}
          onChange={(e) => onChange(e.target.value)}
          className="w-24 rounded border border-zinc-200 px-1.5 py-0.5 text-right text-sm font-semibold tabular-nums text-zinc-900 focus:border-zinc-400 focus:outline-none"
        />
        <span className="text-[11px] text-zinc-400">
          → <span className="font-semibold text-zinc-700">{fmtM(marketCap)}</span>
        </span>
      </div>
    </div>
  );
}

// ── Market Test tab ───────────────────────────────────────────────────────────

const VERDICT_BADGE: Record<string, string> = {
  on_market: "bg-emerald-100 text-emerald-800",
  attractive: "bg-blue-100 text-blue-800",
  rich: "bg-amber-100 text-amber-800",
  below_market: "bg-red-100 text-red-800",
};

const CONFIDENCE_BADGE: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  medium: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  low: "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200",
};

function MarketTestView({
  scenarioId,
  raises,
  shareholders,
  valuation,
  firstCalendarYear,
}: {
  scenarioId: string;
  raises: CapitalRaiseRow[];
  shareholders: ShareholderRow[];
  valuation: ValuationData | null;
  firstCalendarYear: number;
}) {
  // Default investment from first funded equity raise
  const defaultRaise = raises.find(
    (r) => r.type === "equity" && r.investors.some((i) => i.status === "funded") && r.pricePerUnit,
  );
  const defaultInvestmentAmt = defaultRaise
    ? String(
        defaultRaise.investors
          .filter((i) => i.status === "funded")
          .reduce((s, i) => s + Number(i.commitment), 0),
      )
    : "15000000";
  const defaultPricePerShare = defaultRaise?.pricePerUnit
    ? String(Number(defaultRaise.pricePerUnit))
    : "4.00";
  const defaultRaiseName = defaultRaise?.name ?? "Series A";

  const [investmentAmt, setInvestmentAmt] = useState(defaultInvestmentAmt);
  const [pricePerShare, setPricePerShare] = useState(defaultPricePerShare);
  const [raiseName, setRaiseName] = useState(defaultRaiseName);
  const [preMoneyOverride, setPreMoneyOverride] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<MarketTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalPreRaiseShares = shareholders.reduce((s, r) => s + r.shares, 0);
  const investmentAmtNum = Number(investmentAmt) || 0;
  const pricePerShareNum = Number(pricePerShare) || 0;
  const preMoney = preMoneyOverride
    ? Number(preMoneyOverride) || 0
    : totalPreRaiseShares * pricePerShareNum;
  const postMoney = preMoney + investmentAmtNum;
  const pctEquity = postMoney > 0 ? (investmentAmtNum / postMoney) * 100 : 0;

  // Extract valuation model values
  const dcfY1 = valuation?.dcf.find((r) => r.horizonYears === 1);
  const dcfY5 = valuation?.dcf.find((r) => r.horizonYears === 5);
  const evEbitdaY1 = valuation?.evEbitda.find((r) => r.fy === firstCalendarYear);
  const evEbitdaY5 = valuation?.evEbitda.find((r) => r.fy === firstCalendarYear + 4);
  const evRevY1 = valuation?.evRevenue.find((r) => r.fy === firstCalendarYear);
  const evRevY5 = valuation?.evRevenue.find((r) => r.fy === firstCalendarYear + 4);
  const peY1 = valuation?.pe.find((r) => r.fy === firstCalendarYear);
  const peY5 = valuation?.pe.find((r) => r.fy === firstCalendarYear + 4);
  const pbY1 = valuation?.pb.find((r) => r.fy === firstCalendarYear);
  const pbY5 = valuation?.pb.find((r) => r.fy === firstCalendarYear + 4);

  const toNum = (row: { equityValue: string } | undefined) =>
    row ? Number(row.equityValue) || undefined : undefined;

  const aggY1 = valuation?.aggregates[0];
  const aggY5 = valuation?.aggregates[4];

  function pctDiff(
    modelVal: number | undefined,
  ): { pct: number; label: string; cls: string } | null {
    if (!modelVal || !preMoney) return null;
    const pct = ((preMoney - modelVal) / modelVal) * 100;
    const cls = pct <= 0 ? "text-emerald-600" : "text-rose-600";
    const label = `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
    return { pct, label, cls };
  }

  const modelRows: {
    label: string;
    y1: number | undefined;
    y5: number | undefined;
  }[] = [
    {
      label: "DCF",
      y1: toNum(dcfY1 && !dcfY1.invalidReason ? dcfY1 : undefined),
      y5: toNum(dcfY5 && !dcfY5.invalidReason ? dcfY5 : undefined),
    },
    { label: "EV/EBITDA", y1: toNum(evEbitdaY1), y5: toNum(evEbitdaY5) },
    { label: "EV/Revenue", y1: toNum(evRevY1), y5: toNum(evRevY5) },
    { label: "P/E", y1: toNum(peY1), y5: toNum(peY5) },
    { label: "P/B", y1: toNum(pbY1), y5: toNum(pbY5) },
  ];

  function handleRun() {
    setError(null);
    startTransition(async () => {
      const out = await runMarketTest(
        scenarioId,
        {
          investmentAmt: investmentAmtNum,
          pricePerShare: pricePerShareNum,
          preMoney,
          postMoney,
          pctEquity,
          totalPreRaiseShares,
          raiseName,
        },
        {
          dcfEquityValue: modelRows[0].y1,
          evEbitdaEquityY1: modelRows[1].y1,
          evRevenueEquityY1: modelRows[2].y1,
          peEquityY1: modelRows[3].y1,
          pbEquityY1: modelRows[4].y1,
          dcfEquityValueY5: modelRows[0].y5,
          evEbitdaEquityY5: modelRows[1].y5,
          evRevenueEquityY5: modelRows[2].y5,
          peEquityY5: modelRows[3].y5,
          pbEquityY5: modelRows[4].y5,
          revenueY1: aggY1 ? Number(aggY1.revenue) || undefined : undefined,
          ebitdaY1: aggY1 ? Number(aggY1.ebitda) || undefined : undefined,
          netIncomeY1: aggY1 ? Number(aggY1.netIncome) || undefined : undefined,
          revenueY5: aggY5 ? Number(aggY5.revenue) || undefined : undefined,
          ebitdaY5: aggY5 ? Number(aggY5.ebitda) || undefined : undefined,
          netIncomeY5: aggY5 ? Number(aggY5.netIncome) || undefined : undefined,
        },
      );
      if ("ok" in out && !out.ok) {
        setError(out.error ?? "Unknown error");
        setResult(null);
      } else {
        setResult(out as MarketTestResult);
        setError(null);
      }
    });
  }

  const CARD = "rounded-lg border border-zinc-200 bg-white p-4";
  const SECTION_HDR = "text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2";

  return (
    <div className="h-full overflow-auto">
      {/* Summary chips */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/70 px-4 py-2.5">
        <Chip label="Pre-money" value={fmtM(preMoney)} />
        <Chip label="Post-money" value={fmtM(postMoney)} />
        <Chip label="% equity" value={`${pctEquity.toFixed(2)}%`} />
        <Chip label="Price / share" value={`$${pricePerShareNum.toFixed(4)}`} />
        <Chip label="Shares on issue" value={fmt(totalPreRaiseShares)} />
      </div>

      <div className="flex gap-4 p-4" style={{ minHeight: "calc(100% - 44px)" }}>
        {/* Left column */}
        <div className="flex flex-col gap-4" style={{ flex: "0 0 55%" }}>
          {/* Deal parameters card */}
          <div className={CARD}>
            <p className={SECTION_HDR}>Deal Parameters</p>
            <div className="flex flex-col gap-3">
              <InputRow
                label="Raise name"
                value={raiseName}
                onChange={setRaiseName}
                placeholder="Series A"
              />
              <InputRow
                label="Investment amount"
                value={investmentAmt}
                onChange={setInvestmentAmt}
                prefix="$"
                type="number"
                placeholder="15000000"
              />
              <InputRow
                label="Price per share"
                value={pricePerShare}
                onChange={setPricePerShare}
                prefix="$"
                type="number"
                step="0.0001"
                placeholder="4.0000"
              />
              <div className="grid grid-cols-[1fr_160px] items-center gap-2">
                <span className="text-xs text-zinc-700">Pre-money valuation</span>
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
                    $
                  </span>
                  <input
                    type="number"
                    value={preMoneyOverride}
                    onChange={(e) => setPreMoneyOverride(e.target.value)}
                    placeholder={String(Math.round(preMoney))}
                    className="w-full rounded border border-zinc-200 py-1.5 pl-5 pr-2 text-right text-xs tabular-nums text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  />
                </div>
              </div>
              {!preMoneyOverride && preMoney > 0 && (
                <p className="text-[10px] text-zinc-400 -mt-1">
                  Auto-calculated: {fmt(totalPreRaiseShares)} shares × $
                  {pricePerShareNum.toFixed(4)} = {fmtM(preMoney)}
                </p>
              )}
              <div className="mt-1 grid grid-cols-2 gap-2 rounded-md bg-zinc-50 p-3 text-xs">
                <span className="text-zinc-500">Post-money</span>
                <span className="text-right font-semibold tabular-nums text-zinc-900">
                  {fmtM(postMoney)}
                </span>
                <span className="text-zinc-500">% equity offered</span>
                <span className="text-right font-semibold tabular-nums text-zinc-900">
                  {pctEquity.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>

          {/* Valuation benchmark table */}
          <div className={CARD}>
            <p className={SECTION_HDR}>Valuation Benchmark</p>
            {!valuation ? (
              <p className="text-[11px] italic text-zinc-400">
                Configure valuation assumptions on the Valuation tab to see benchmarks.
              </p>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200">
                    <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Model
                    </th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Y1 Equity Value
                    </th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      Y5 Equity Value
                    </th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      vs Y1
                    </th>
                    <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                      vs Y5
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {modelRows.map((row) => {
                    const diffY1 = pctDiff(row.y1);
                    const diffY5 = pctDiff(row.y5);
                    return (
                      <tr key={row.label} className="hover:bg-zinc-50/50">
                        <td className="py-1.5 font-medium text-zinc-700">{row.label}</td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-800">
                          {row.y1 !== undefined ? (
                            fmtM(row.y1)
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-zinc-800">
                          {row.y5 !== undefined ? (
                            fmtM(row.y5)
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                        <td
                          className={`py-1.5 text-right tabular-nums font-medium ${diffY1 ? diffY1.cls : "text-zinc-300"}`}
                        >
                          {diffY1 ? diffY1.label : "—"}
                        </td>
                        <td
                          className={`py-1.5 text-right tabular-nums font-medium ${diffY5 ? diffY5.cls : "text-zinc-300"}`}
                        >
                          {diffY5 ? diffY5.label : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-zinc-200 bg-zinc-50">
                    <td colSpan={2} className="py-1.5 text-[10px] font-semibold text-zinc-500">
                      Pre-money (deal)
                    </td>
                    <td
                      colSpan={3}
                      className="py-1.5 text-right text-xs font-semibold tabular-nums text-zinc-800"
                    >
                      {fmtM(preMoney)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
            <p className="mt-2 text-[10px] text-zinc-400">
              Green = pre-money is at a discount to model; red = premium. vs Y1 is most
              conservative.
            </p>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4" style={{ flex: "0 0 45%" }}>
          {/* Run button */}
          <button
            type="button"
            onClick={handleRun}
            disabled={isPending || investmentAmtNum <= 0 || pricePerShareNum <= 0}
            className="w-full rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Analysing…" : "Run AI Analysis"}
          </button>

          {isPending && (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-6 text-sm text-indigo-700">
              <svg
                className="h-5 w-5 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Claude is analysing the deal…
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {error}
            </div>
          )}

          {result && !isPending && (
            <div className={`${CARD} flex flex-col gap-4`}>
              {/* Verdict + confidence */}
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${VERDICT_BADGE[result.verdict] ?? "bg-zinc-100 text-zinc-700"}`}
                >
                  {result.verdictLabel}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_BADGE[result.confidence] ?? "bg-zinc-100 text-zinc-500"}`}
                >
                  {result.confidence.charAt(0).toUpperCase() + result.confidence.slice(1)}{" "}
                  confidence
                </span>
              </div>

              {/* Summary */}
              <p className="text-xs leading-relaxed text-zinc-700">{result.summary}</p>

              {/* Valuation commentary */}
              <div>
                <p className={SECTION_HDR}>Valuation Commentary</p>
                <p className="text-xs leading-relaxed text-zinc-700">
                  {result.valuationCommentary}
                </p>
              </div>

              {/* Structure commentary */}
              <div>
                <p className={SECTION_HDR}>Structure Commentary</p>
                <p className="text-xs leading-relaxed text-zinc-700">
                  {result.structureCommentary}
                </p>
              </div>

              {/* Strengths + risks */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className={SECTION_HDR}>Key Strengths</p>
                  <ul className="flex flex-col gap-1">
                    {result.keyStrengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-emerald-700">
                        <span className="mt-0.5 text-emerald-500">●</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className={SECTION_HDR}>Key Risks</p>
                  <ul className="flex flex-col gap-1">
                    {result.keyRisks.map((r, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11px] text-rose-700">
                        <span className="mt-0.5 text-rose-400">●</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Comparable deals */}
              {result.comparableDeals.length > 0 && (
                <div>
                  <p className={SECTION_HDR}>Comparable Deals</p>
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="border-b border-zinc-200">
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          Company
                        </th>
                        <th className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          Stage
                        </th>
                        <th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          Pre-money
                        </th>
                        <th className="pb-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                          Rev. Mult.
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {result.comparableDeals.map((c, i) => (
                        <tr key={i} className="hover:bg-zinc-50/60">
                          <td className="py-1.5 font-medium text-zinc-800">{c.company}</td>
                          <td className="py-1.5 text-zinc-500">{c.stage}</td>
                          <td className="py-1.5 text-right tabular-nums text-zinc-700">
                            {c.preMoneyAUD}
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-zinc-700">
                            {c.revenueMultiple}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {result.comparableDeals.map(
                      (c, i) =>
                        c.note && (
                          <p key={i} className="text-[10px] text-zinc-400">
                            {c.company}: {c.note}
                          </p>
                        ),
                    )}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className="rounded-md bg-zinc-50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 mb-1">
                  Recommendation
                </p>
                <p className="text-xs italic leading-relaxed text-zinc-700">
                  {result.recommendation}
                </p>
              </div>

              {/* Re-run */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={isPending}
                  className="text-[10px] text-zinc-400 underline hover:text-zinc-700"
                >
                  Re-run analysis
                </button>
              </div>
            </div>
          )}

          {!result && !isPending && !error && (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-zinc-200 px-4 py-12 text-center">
              <div>
                <p className="text-sm font-medium text-zinc-500">No analysis yet</p>
                <p className="mt-1 text-[11px] text-zinc-400">
                  Configure deal parameters and click Run AI Analysis
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Market Test helpers ───────────────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-white px-2.5 py-1 ring-1 ring-zinc-200">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <span className="text-[11px] font-semibold tabular-nums text-zinc-800">{value}</span>
    </div>
  );
}

function InputRow({
  label,
  value,
  onChange,
  prefix,
  type = "text",
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  type?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_160px] items-center gap-2">
      <span className="text-xs text-zinc-700">{label}</span>
      <div className="relative">
        {prefix && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-zinc-400">
            {prefix}
          </span>
        )}
        <input
          type={type}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded border border-zinc-200 py-1.5 text-right text-xs tabular-nums text-zinc-900 focus:border-zinc-400 focus:outline-none ${prefix ? "pl-5 pr-2" : "px-2"}`}
        />
      </div>
    </div>
  );
}
