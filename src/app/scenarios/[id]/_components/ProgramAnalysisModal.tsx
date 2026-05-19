"use client";

import { useEffect, useState } from "react";
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
import type { ProgramAnalysisData } from "./programAnalysisData";

const COLORS = {
  emerald: "#10b981",
  sky: "#0ea5e9",
  indigo: "#6366f1",
  amber: "#f59e0b",
  rose: "#f43f5e",
  violet: "#8b5cf6",
  teal: "#14b8a6",
  zinc: "#71717a",
};
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

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}b`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

type RechartsValue =
  | number
  | string
  | readonly (number | string)[]
  | undefined;
const moneyFmt = (label: string) =>
  (v: RechartsValue): [string, string] => [fmtMoney2(Number(v)), label];
const countFmt = (label: string) =>
  (v: RechartsValue): [string, string] => [fmtNum0(Number(v)), label];
const bpsFmt = (v: RechartsValue): [string, string] => [
  `${Math.round(Number(v))} bps`,
  "Spread",
];

export function ProgramAnalysisModal({ data }: { data: ProgramAnalysisData }) {
  const [open, setOpen] = useState(false);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    // Lock body scroll while open.
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
        className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
      >
        Analysis
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-zinc-900/40 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Slide-up sheet */}
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Capital Programs Analysis"
        className={`fixed inset-x-0 bottom-0 top-6 z-50 transform overflow-hidden rounded-t-xl bg-zinc-50 shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900">
              Capital Programs Analysis
            </h2>
            <p className="text-xs text-zinc-500">
              Cross-program comparison · year-on-year capital deployment ·
              funding economics
            </p>
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
          {data.programCount === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
              <div>No capital programs yet.</div>
              <div className="text-xs">
                Add or seed programs to see the analysis.
              </div>
            </div>
          ) : (
            <>
              {/* Headline tiles */}
              <div className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6">
                <Tile label="Programs" value={fmtNum0(data.programCount)} />
                <Tile
                  label="Total deal size"
                  value={fmtMoney2(data.totalDealSize)}
                />
                <Tile
                  label="Tranche principal"
                  value={fmtMoney2(data.totalTranchePrincipal)}
                />
                <Tile
                  label="Annual interest"
                  value={fmtMoney2(data.totalAnnualInterest)}
                  tone="rose"
                />
                <Tile
                  label="Annual fees"
                  value={fmtMoney2(data.totalAnnualFees)}
                  tone="emerald"
                />
                <Tile
                  label="Loan balance backing"
                  value={fmtMoney2(data.totalLoanBalance)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-2">
                {/* 1. Active deal size by FY (year-on-year growth) */}
                <Card
                  title="Year-on-year capital deployment"
                  subtitle="Active program principal per FY (bars) + active program count (line)"
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart
                      data={data.activeByFy}
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
                        width={72}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: RechartsValue, name) =>
                          name === "Active principal"
                            ? [fmtMoney2(Number(value)), "Active principal"]
                            : [fmtNum0(Number(value)), "Active programs"]
                        }
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#52525b" }}
                        iconType="circle"
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="value"
                        name="Active principal"
                        fill={COLORS.emerald}
                        radius={[6, 6, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="value2"
                        name="Active programs"
                        stroke={COLORS.indigo}
                        strokeWidth={2}
                        dot={{ r: 3, fill: COLORS.indigo }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

                {/* 2. New deals launched per FY */}
                <Card
                  title="New programs launched per FY"
                  subtitle="$ volume of deals coming online each year"
                >
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart
                      data={data.newDealsByFy}
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
                        width={72}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(value: RechartsValue, name) =>
                          name === "New principal"
                            ? [fmtMoney2(Number(value)), "New principal"]
                            : [fmtNum0(Number(value)), "New programs"]
                        }
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#52525b" }}
                        iconType="circle"
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="value"
                        name="New principal"
                        fill={COLORS.sky}
                        radius={[6, 6, 0, 0]}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="value2"
                        name="New programs"
                        stroke={COLORS.amber}
                        strokeWidth={2}
                        dot={{ r: 3, fill: COLORS.amber }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </Card>

                {/* 3. Count by program type */}
                <Card
                  title="Programs by type"
                  subtitle="Count of deals by program type"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.countByType}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
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
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={countFmt("Programs")}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.countByType.map((_, i) => (
                          <Cell key={i} fill={palette[i % palette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* 4. Deal size by program type */}
                <Card
                  title="Deal size by type"
                  subtitle="Aggregate $ principal by program type"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.dealSizeByType}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#d4d4d8" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => fmtShort(Number(v))}
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={moneyFmt("Deal size")}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.dealSizeByType.map((_, i) => (
                          <Cell key={i} fill={palette[i % palette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* 5. Annual interest expense by program */}
                <Card
                  title="Annual interest expense by program"
                  subtitle="Top 10 programs by interest cost"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.annualInterestByProgram}
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
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={160}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={moneyFmt("Interest expense")}
                      />
                      <Bar
                        dataKey="value"
                        fill={COLORS.rose}
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* 6. NIM bps by program (positive vs negative) */}
                <Card
                  title="Program NIM by deal"
                  subtitle="Assets WAS − Liabilities WAS · positive = profitable"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.nimBpsByProgram}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={{ stroke: "#d4d4d8" }}
                        tickLine={false}
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={160}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={bpsFmt}
                      />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                        {data.nimBpsByProgram.map((row, i) => (
                          <Cell
                            key={i}
                            fill={row.value < 0 ? COLORS.rose : COLORS.emerald}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                {/* 7. WAS comparison: Assets vs Liabilities side-by-side */}
                <Card
                  title="Assets WAS vs Liabilities WAS"
                  subtitle="Side-by-side spread comparison · gap = NIM"
                  fullWidth
                >
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={data.wasComparison}
                      margin={{ top: 8, right: 16, left: 0, bottom: 60 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={{ stroke: "#d4d4d8" }}
                        tickLine={false}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v: RechartsValue, name) => [
                          `${Math.round(Number(v))} bps`,
                          name as string,
                        ]}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11, color: "#52525b" }}
                        iconType="circle"
                      />
                      <Bar
                        dataKey="assetsWas"
                        name="Assets WAS"
                        fill={COLORS.emerald}
                        radius={[6, 6, 0, 0]}
                      />
                      <Bar
                        dataKey="liabsWas"
                        name="Liabilities WAS"
                        fill={COLORS.rose}
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* ───── Fees section ───── */}
              <SectionHeader
                title="Fee economics"
                subtitle="Annual fee streams across all programs"
              />
              <div className="grid grid-cols-1 gap-4 px-6 pb-6 lg:grid-cols-2">
                <Card
                  title="Annual fees by category"
                  subtitle="Senior mgmt · Sub mgmt · Servicing · Other"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.feesByCategory}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#d4d4d8" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => fmtShort(Number(v))}
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={moneyFmt("Annual fees")}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.feesByCategory.map((_, i) => (
                          <Cell key={i} fill={palette[i % palette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card
                  title="Annual fees by program"
                  subtitle="Top 10 fee earners"
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.feesByProgram}
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
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={160}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={moneyFmt("Annual fees")}
                      />
                      <Bar
                        dataKey="value"
                        fill={COLORS.emerald}
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>

              {/* ───── Liabilities section ───── */}
              <SectionHeader
                title="Liabilities & funding stack"
                subtitle="Tranche-level view across all capital programs"
              />
              <div className="grid grid-cols-1 gap-4 px-6 pb-8 lg:grid-cols-2">
                <Card
                  title="Tranche principal by rate type"
                  subtitle="Variable + base vs Fixed funding mix"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.trancheRateMix}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 11, fontWeight: 600 }}
                        axisLine={{ stroke: "#d4d4d8" }}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(v) => fmtShort(Number(v))}
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={moneyFmt("Principal")}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.trancheRateMix.map((row, i) => (
                          <Cell
                            key={i}
                            fill={
                              row.label === "Variable + base"
                                ? COLORS.amber
                                : COLORS.zinc
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card
                  title="Tranches by spread band"
                  subtitle="Distribution of debt tranches by credit spread (bps)"
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.trancheBySpreadBucket}
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
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={40}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={countFmt("Tranches")}
                      />
                      <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                        {data.trancheBySpreadBucket.map((_, i) => (
                          <Cell key={i} fill={palette[i % palette.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card
                  title="Liabilities WAS by program"
                  subtitle="Top 10 programs by debt-tranche WAS (bps)"
                  fullWidth
                >
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={data.liabsWasByProgram}
                      layout="vertical"
                      margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid stroke="#e4e4e7" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fill: "#52525b", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => `${Math.round(Number(v))}`}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        tick={{ fill: "#52525b", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        width={160}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={bpsFmt}
                      />
                      <Bar
                        dataKey="value"
                        fill={COLORS.rose}
                        radius={[0, 6, 6, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="border-y border-zinc-200 bg-white px-6 py-3">
      <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
        {title}
      </h3>
      {subtitle ? (
        <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
      ) : null}
    </div>
  );
}

function Card({
  title,
  subtitle,
  fullWidth,
  children,
}: {
  title: string;
  subtitle?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border border-zinc-200 bg-white p-5 shadow-sm ${
        fullWidth ? "lg:col-span-2" : ""
      }`}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-900">
          {title}
        </h3>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rose" | "emerald";
}) {
  const valueClass =
    tone === "rose"
      ? "text-rose-700"
      : tone === "emerald"
        ? "text-emerald-700"
        : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-5 py-4">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={`text-xl font-semibold tabular-nums ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
