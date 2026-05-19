"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney2, fmtNum0 } from "@/utils/format";
import type { BarPoint, LoanAnalysisData } from "./loanAnalysisData";

const COLORS = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  indigo: "#6366f1",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  zinc: "#71717a",
  emeraldDark: "#047857",
  skyDark: "#0284c7",
};

// Compact USD-style formatter for axis ticks ($1.2M, $850k, etc.).
function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

export function LoanBookAnalysisTab({ data }: { data: LoanAnalysisData }) {
  if (data.loanCount === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-white text-sm text-zinc-500">
        <div>No loans yet.</div>
        <div className="text-xs">Upload a tape or seed the loan book to see analysis.</div>
      </div>
    );
  }

  // Diverse colours for state / asset class bars — apply per-cell so each bar
  // reads as a distinct category rather than a uniform "value" series.
  const palette = [
    COLORS.emerald,
    COLORS.sky,
    COLORS.indigo,
    COLORS.amber,
    COLORS.violet,
    COLORS.teal,
    COLORS.rose,
    COLORS.zinc,
  ];

  return (
    <div className="h-full overflow-auto bg-zinc-50">
      {/* Headline tiles */}
      <div className="grid grid-cols-1 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <Tile label="Total loans" value={fmtNum0(data.loanCount)} />
        <Tile label="Total balance" value={fmtMoney2(data.totalBalance)} />
        <Tile label="Average loan size" value={fmtMoney2(data.avgBalance)} />
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-2">
        {/* 1. Originations by FY — volume bars + count line (composed) */}
        <Card
          title="Originations by fiscal year"
          subtitle="Volume ($) and count of new loans booked each FY"
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart
              data={data.originationsByFy}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                yAxisId="left"
                tickFormatter={(v) => fmtShort(Number(v))}
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value: RechartsValue, name) =>
                  name === "Volume"
                    ? [fmtMoney2(Number(value)), "Volume"]
                    : [fmtNum0(Number(value)), "Loans"]
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, color: "#52525b" }} iconType="circle" />
              <Bar
                yAxisId="left"
                dataKey="value"
                name="Volume"
                fill={COLORS.emerald}
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="value2"
                name="Loans"
                stroke={COLORS.indigo}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.indigo }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        {/* 2. Originations by month (timeline) */}
        <Card title="Originations by month" subtitle="Monthly count across the imported tape">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.originationsByMonth}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 10 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={countFormatter} />
              <Bar dataKey="value" fill={COLORS.sky} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 3. State — # of deals (horizontal) */}
        <Card title="Deals by state" subtitle="Loan count by Australian state">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.countByState}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={countFormatter} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {data.countByState.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 4. State — $ volume (horizontal) */}
        <Card title="$ Volume by state" subtitle="Aggregate loan balance by state">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.volumeByState}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtShort(Number(v))}
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={moneyFormatter("Volume")} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {data.volumeByState.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 5. LVR buckets — count */}
        <Card title="LVR distribution · loan count" subtitle="% of loans by underwritten LVR band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.lvrCount} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={countWithPctFormatter(data.loanCount)}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.lvrCount.map((_, i) => (
                  <Cell key={i} fill={lvrColor(i, data.lvrCount.length)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 6. LVR buckets — $ volume */}
        <Card title="LVR distribution · $ volume" subtitle="Aggregate balance by LVR band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.lvrVolume} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmtShort(Number(v))}
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={moneyFormatter("Volume")} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.lvrVolume.map((_, i) => (
                  <Cell key={i} fill={lvrColor(i, data.lvrVolume.length)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 7. DSCR buckets */}
        <Card title="DSCR distribution" subtitle="Underwritten DSCR coverage bands">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.dscrCount} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={countFormatter} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.dscrCount.map((_, i) => (
                  <Cell key={i} fill={dscrColor(i, data.dscrCount.length)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 8. Program type mix */}
        <Card title="Capital program mix" subtitle="$ volume by program type">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.programTypeVolume}
              margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => fmtShort(Number(v))}
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={moneyFormatter("Volume")} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.programTypeVolume.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 9. Asset class mix */}
        <Card title="Asset class mix" subtitle="$ volume by collateral asset class">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data.assetClassVolume}
              layout="vertical"
              margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
            >
              <CartesianGrid stroke="#e4e4e7" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtShort(Number(v))}
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={moneyFormatter("Volume")} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {data.assetClassVolume.map((_, i) => (
                  <Cell key={i} fill={palette[i % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* 10. Grade distribution */}
        <Card
          title="Internal grade distribution"
          subtitle="Number of loans per Gallantree grade tier"
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data.gradeCount} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                axisLine={{ stroke: "#d4d4d8" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={countFormatter} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {data.gradeCount.map((row, i) => (
                  <Cell key={i} fill={gradeColor(row.label)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

// Recharts' Formatter type is wider than what we need — accept its full union
// and coerce. Saves writing four near-identical inline functions per chart.
type RechartsValue = number | string | readonly (number | string)[] | undefined;
function countFormatter(v: RechartsValue): [string, string] {
  return [fmtNum0(Number(v)), "Loans"];
}
function moneyFormatter(label: string) {
  return (v: RechartsValue): [string, string] => [fmtMoney2(Number(v)), label];
}
function countWithPctFormatter(total: number) {
  return (v: RechartsValue): [string, string] => {
    const n = Number(v);
    const pct = total > 0 ? (n / total) * 100 : 0;
    return [`${fmtNum0(n)} (${pct.toFixed(1)}%)`, "Loans"];
  };
}

// LVR colour scale: green at low LVR → amber → rose at high LVR.
function lvrColor(i: number, total: number): string {
  const ratio = total > 1 ? i / (total - 1) : 0;
  // Hue: 150 (emerald) → 30 (amber) → 0 (rose)
  const hue = 150 - ratio * 150;
  return `hsl(${hue}, 70%, 48%)`;
}

// DSCR colour: low coverage = rose, healthy = emerald.
function dscrColor(i: number, total: number): string {
  const ratio = total > 1 ? i / (total - 1) : 0;
  const hue = ratio * 150; // 0 → 150
  return `hsl(${hue}, 70%, 48%)`;
}

// Grade colour: top grades get green/blue, mid-yellow, low-rose.
function gradeColor(grade: string): string {
  const tier = grade.charAt(0);
  switch (tier) {
    case "A":
      return COLORS.emerald;
    case "B":
      return COLORS.sky;
    case "C":
      return COLORS.amber;
    case "D":
      return "#f97316"; // orange
    default:
      return COLORS.rose;
  }
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
    <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-white px-5 py-3">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="text-xl font-semibold tabular-nums text-zinc-900">{value}</span>
    </div>
  );
}

// Type-only re-export so consumers can declare prop types without dragging
// the client bundle in.
export type { BarPoint, LoanAnalysisData };
