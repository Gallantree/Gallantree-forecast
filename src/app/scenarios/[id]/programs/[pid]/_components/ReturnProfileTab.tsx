"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtMoney2, fmtNum0, fmtNum2 } from "@/utils/format";
import type { ReturnProfileData } from "./returnProfileData";

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

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
} as const;

type RechartsValue = number | string | readonly (number | string)[] | undefined;

const pctFmt =
  (label: string) =>
  (v: RechartsValue): [string, string] => {
    if (v === undefined || v === null || v === "") return ["—", label];
    return [`${fmtNum2(Number(v))}%`, label];
  };

const TYPE_LABEL: Record<string, string> = {
  CRE_CLO: "CRE CLO",
  CMBS: "CMBS",
  MIT_FUND: "MIT Fund",
  WAREHOUSE: "Warehouse",
  OTHER: "Other",
};

const TYPE_COLOR: Record<string, string> = {
  CRE_CLO: "bg-emerald-100 text-emerald-800",
  CMBS: "bg-sky-100 text-sky-800",
  MIT_FUND: "bg-violet-100 text-violet-800",
  WAREHOUSE: "bg-amber-100 text-amber-800",
  OTHER: "bg-zinc-100 text-zinc-700",
};

const WARNING_LABEL: Record<
  NonNullable<ReturnProfileData["holdings"][number]["warning"]>,
  string
> = {
  "no-loans": "Underlying program has no loans assigned — residual is zero",
  "no-equity-tranche": "Underlying program has no equity tranche to allocate residual to",
  "tranche-missing": "Selected tranche name not found on underlying program",
};

export function ReturnProfileTab({ data }: { data: ReturnProfileData }) {
  if (data.empty) {
    return <EmptyState data={data} />;
  }

  // Chart data is keyed by FY label.
  const chartData = data.byFy.map((f) => ({
    label: f.label,
    fundYield: f.fundYieldPct ?? 0,
    baseRate: f.baseRatePct,
    target: f.targetRatePct,
  }));

  // Build per-holding rows for the breakdown table.
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Headline metrics */}
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Fund return profile
        </h3>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryTile
            label="Held equity principal"
            value={fmtMoney2(data.totalHeldEquityPrincipalAtFull)}
          />
          <SummaryTile
            label="Steady-state yield"
            tone={
              data.steadyStateFundYieldPct !== null && data.steadyStateFundYieldPct >= 0
                ? "ok"
                : "warn"
            }
            value={
              data.steadyStateFundYieldPct !== null
                ? `${fmtNum2(data.steadyStateFundYieldPct)}% p.a.`
                : "—"
            }
          />
          <SummaryTile
            label="Benchmark (base + target)"
            value={`${fmtNum2(data.targetRatePct)}% p.a.`}
          />
          <SummaryTile
            label="Base rate"
            value={`${fmtNum2(data.baseRatePct)}% (${data.baseRateBps} bps)`}
          />
          <SummaryTile
            label="Target spread"
            value={data.targetSpreadBps > 0 ? `${data.targetSpreadBps} bps` : "—"}
          />
        </div>
      </section>

      {/* Chart: fund yield vs benchmark per FY */}
      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Yield vs benchmark by FY
          </h3>
          <p className="text-[11px] text-zinc-500">
            Residual cashflow on held equity tranches, scaled by each underlying program&apos;s ramp
            / amortisation factor.
          </p>
        </div>
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e4e4e7" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#52525b", fontSize: 11 }} />
              <YAxis
                tick={{ fill: "#52525b", fontSize: 11 }}
                tickFormatter={(v) => `${Number(v).toFixed(0)}%`}
                width={48}
              />
              <Tooltip contentStyle={tooltipStyle} formatter={pctFmt("")} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
              <Bar
                dataKey="fundYield"
                name="Fund yield"
                fill={COLORS.indigo}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              />
              <Line
                dataKey="target"
                name="Target (base + spread)"
                type="monotone"
                stroke={COLORS.emerald}
                strokeWidth={2}
                dot={{ r: 3, fill: COLORS.emerald }}
                isAnimationActive={false}
              />
              <Line
                dataKey="baseRate"
                name="Base rate"
                type="monotone"
                stroke={COLORS.zinc}
                strokeDasharray="4 3"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Per-FY rollup table */}
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Per-FY rollup
        </h3>
        <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <Th>FY</Th>
                <Th className="text-right">Held equity principal</Th>
                <Th className="text-right">Residual cashflow</Th>
                <Th className="text-right">Fund yield</Th>
                <Th className="text-right">Target</Th>
                <Th className="text-right">Spread vs target</Th>
              </tr>
            </thead>
            <tbody>
              {data.byFy.map((f) => {
                const spreadVsTarget =
                  f.fundYieldPct !== null ? f.fundYieldPct - f.targetRatePct : null;
                return (
                  <tr key={f.fyIndex} className="border-t border-zinc-100 hover:bg-yellow-50/40">
                    <Td className="font-medium">{f.label}</Td>
                    <Td className="text-right tabular-nums">
                      {f.heldPrincipal > 0 ? fmtMoney2(f.heldPrincipal) : "—"}
                    </Td>
                    <Td
                      className={`text-right tabular-nums ${
                        f.fundResidualAnnual >= 0 ? "text-zinc-700" : "text-rose-700"
                      }`}
                    >
                      {fmtMoney2(f.fundResidualAnnual)}
                    </Td>
                    <Td
                      className={`text-right tabular-nums font-semibold ${
                        f.fundYieldPct === null
                          ? "text-zinc-400"
                          : f.fundYieldPct >= f.targetRatePct
                            ? "text-emerald-700"
                            : f.fundYieldPct >= 0
                              ? "text-zinc-700"
                              : "text-rose-700"
                      }`}
                    >
                      {f.fundYieldPct !== null ? `${fmtNum2(f.fundYieldPct)}%` : "—"}
                    </Td>
                    <Td className="text-right tabular-nums text-zinc-500">
                      {fmtNum2(f.targetRatePct)}%
                    </Td>
                    <Td
                      className={`text-right tabular-nums font-semibold ${
                        spreadVsTarget === null
                          ? "text-zinc-400"
                          : spreadVsTarget >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                      }`}
                    >
                      {spreadVsTarget !== null
                        ? `${spreadVsTarget >= 0 ? "+" : ""}${fmtNum2(spreadVsTarget)}%`
                        : "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-holding contribution */}
      <section>
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Holdings &middot; expected return contribution
        </h3>
        <div className="overflow-auto rounded-md border border-zinc-200 bg-white">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                <Th>Underlying program</Th>
                <Th>Tranche</Th>
                <Th className="text-right"># notes</Th>
                <Th className="text-right">Principal</Th>
                <Th className="text-right">Residual / yr</Th>
                <Th className="text-right">Steady-state yield</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => (
                <tr
                  key={`${h.programId}-${h.trancheName}`}
                  className="border-t border-zinc-100 hover:bg-yellow-50/40"
                >
                  <Td className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{h.programName}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${TYPE_COLOR[h.programType] ?? TYPE_COLOR.OTHER}`}
                      >
                        {TYPE_LABEL[h.programType] ?? h.programType}
                      </span>
                    </div>
                  </Td>
                  <Td className="text-zinc-700">{h.trancheName}</Td>
                  <Td className="text-right tabular-nums text-zinc-600">
                    {h.trancheNumNotes > 0 ? fmtNum0(h.trancheNumNotes) : "—"}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {h.tranchePrincipalAtFull > 0 ? fmtMoney2(h.tranchePrincipalAtFull) : "—"}
                  </Td>
                  <Td
                    className={`text-right tabular-nums ${
                      h.steadyStateResidualAnnual >= 0 ? "text-indigo-700" : "text-rose-700"
                    }`}
                  >
                    {h.tranchePrincipalAtFull > 0 ? fmtMoney2(h.steadyStateResidualAnnual) : "—"}
                  </Td>
                  <Td
                    className={`text-right tabular-nums font-semibold ${
                      h.steadyStateYieldPct === null
                        ? "text-zinc-400"
                        : h.steadyStateYieldPct >= data.targetRatePct
                          ? "text-emerald-700"
                          : h.steadyStateYieldPct >= 0
                            ? "text-zinc-700"
                            : "text-rose-700"
                    }`}
                  >
                    {h.steadyStateYieldPct !== null
                      ? `${fmtNum2(h.steadyStateYieldPct)}% p.a.`
                      : "—"}
                  </Td>
                  <Td className="text-[11px] text-zinc-500">
                    {h.warning ? WARNING_LABEL[h.warning] : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function EmptyState({ data }: { data: ReturnProfileData }) {
  const messages: Record<NonNullable<ReturnProfileData["emptyReason"]>, string> = {
    "not-mit-fund":
      "Return profile is only available for MIT Fund programs. This view aggregates the expected per-annum yield on equity tranches that a MIT Fund acquires from other capital programs in this scenario.",
    "no-holdings":
      "This fund has no captive equity holdings yet. Use the Equity Holdings modal on the Capital Programs tab to select the equity tranches the fund acquires from other programs.",
    "no-underlying-data":
      "The fund's selected equity tranches couldn't be priced — the underlying programs are missing loans, equity tranches, or the named tranche is no longer present.",
  };
  const reason = data.emptyReason ?? "no-holdings";
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-2 px-8 text-center text-sm text-zinc-500">
      <div className="max-w-xl">{messages[reason]}</div>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-0.5 bg-white px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</span>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-zinc-200 px-3 py-1.5 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
