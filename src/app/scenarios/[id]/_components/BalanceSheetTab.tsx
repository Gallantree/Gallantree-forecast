import { Fragment } from "react";
import { fmtMoney2, fmtNum0 } from "@/utils/format";
import { EditWorkingCapitalModal } from "./EditWorkingCapitalModal";
import type { FYGroup } from "./PnlClientTable";

export interface SerializedSeries {
  monthly: Record<string, string>;
}

export interface BalanceSheetData {
  horizon: string[];
  groups: FYGroup[];
  // Assets
  cash: SerializedSeries;
  ar: SerializedSeries;
  ppeGross: SerializedSeries;
  accumulatedDepreciation: SerializedSeries;
  ppeNet: SerializedSeries;
  prepaidIssuanceCosts: SerializedSeries;
  totalAssets: SerializedSeries;
  // L&E
  ap: SerializedSeries;
  notesPayable: SerializedSeries;
  deferredRevenue: SerializedSeries;
  equity: SerializedSeries;
  totalLiabilitiesAndEquity: SerializedSeries;
  // Headline
  closingCash: string;
  closingEquity: string;
  closingTotalAssets: string;
  // Assumptions echo
  assumptions: {
    dsoDays?: string;
    dpoDays?: string;
    taxRatePct?: string;
    openingCash?: string;
    openingEquity?: string;
  };
}

function valueAt(series: SerializedSeries, periodKey: string): number {
  return Number(series.monthly[periodKey] ?? "0");
}

// Period-end balance for an FY = the value at the last month of that FY.
function fyEnd(series: SerializedSeries, months: string[]): number {
  if (months.length === 0) return 0;
  return valueAt(series, months[months.length - 1]);
}

function maxDrift(bs: BalanceSheetData): number {
  let max = 0;
  for (const pk of bs.horizon) {
    const a = valueAt(bs.totalAssets, pk);
    const le = valueAt(bs.totalLiabilitiesAndEquity, pk);
    const d = Math.abs(a - le);
    if (d > max) max = d;
  }
  return max;
}

export function BalanceSheetTab({
  scenarioId,
  data,
}: {
  scenarioId: string;
  data: BalanceSheetData;
}) {
  const { groups } = data;
  const drift = maxDrift(data);
  const drifted = drift > 1; // > $1 over any month means the model doesn't balance

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Headline tiles */}
      <div className="grid grid-cols-4 gap-px border-b border-zinc-200 bg-zinc-200">
        <Tile label="Closing cash" value={fmtMoney2(data.closingCash)} />
        <Tile label="Closing equity" value={fmtMoney2(data.closingEquity)} />
        <Tile label="Closing total assets" value={fmtMoney2(data.closingTotalAssets)} />
        <Tile
          label="A − (L + E) check"
          value={drifted ? `± ${fmtMoney2(drift)}` : "balanced"}
          tone={drifted ? "warn" : "ok"}
        />
      </div>

      {/* Assumptions banner */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-600">
        <Stat label="DSO (days)" value={data.assumptions.dsoDays ?? "0"} />
        <Stat label="DPO (days)" value={data.assumptions.dpoDays ?? "0"} />
        <EditWorkingCapitalModal
          scenarioId={scenarioId}
          initialDso={data.assumptions.dsoDays ?? "0"}
          initialDpo={data.assumptions.dpoDays ?? "0"}
        />
        <Stat label="Tax rate" value={`${data.assumptions.taxRatePct ?? "0"}%`} />
        <Stat label="Opening cash" value={fmtMoney2(data.assumptions.openingCash ?? "0")} />
        <Stat label="Opening equity" value={fmtMoney2(data.assumptions.openingEquity ?? "0")} />
        <span className="ml-auto text-zinc-400">
          BS values are period-end balances; FY columns show the FY-end balance.
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-100 text-zinc-600">
              <th className="sticky left-0 z-30 w-72 border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-left font-medium">
                Line
              </th>
              {groups.map((g) => (
                <th
                  key={`fyhead-${g.fy}`}
                  colSpan={g.months.length + 1}
                  className="border-b border-r border-zinc-300 bg-zinc-100 px-3 py-1.5 text-center font-semibold tracking-wide"
                >
                  FY{String(g.fy).slice(-2)}
                </th>
              ))}
            </tr>
            <tr className="bg-zinc-50 text-[11px] text-zinc-500">
              <th className="sticky left-0 z-30 border-b border-r border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left"></th>
              {groups.map((g) => (
                <Fragment key={`hdr-fy-${g.fy}`}>
                  {g.months.map((pk) => (
                    <th
                      key={`hdr-${pk}`}
                      className="min-w-[78px] border-b border-zinc-200 px-2 py-1.5 text-right font-mono font-normal"
                    >
                      {pk.slice(2)}
                    </th>
                  ))}
                  <th className="min-w-[96px] border-b border-r border-zinc-300 bg-zinc-100 px-2 py-1.5 text-right font-semibold text-zinc-700">
                    FY{String(g.fy).slice(-2)} close
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionHeader
              colSpan={totalCols(groups)}
              label="Assets"
              color="bg-emerald-50 text-emerald-800"
            />
            <Row label="Cash" series={data.cash} groups={groups} />
            <Row label="Accounts receivable" series={data.ar} groups={groups} />
            <Row label="PPE — gross" series={data.ppeGross} groups={groups} subtle />
            <Row
              label="Less: accumulated depreciation"
              series={data.accumulatedDepreciation}
              groups={groups}
              subtle
              negative
            />
            <Row label="PPE — net" series={data.ppeNet} groups={groups} />
            <Row
              label="Prepaid issuance costs (deferred deal costs)"
              series={data.prepaidIssuanceCosts}
              groups={groups}
            />
            <TotalRow label="Total assets" series={data.totalAssets} groups={groups} />

            <SectionHeader
              colSpan={totalCols(groups)}
              label="Liabilities & Equity"
              color="bg-rose-50 text-rose-800"
            />
            <Row label="Accounts payable" series={data.ap} groups={groups} />
            <Row
              label="Notes payable (capital program liabilities)"
              series={data.notesPayable}
              groups={groups}
            />
            <Row
              label="Deferred revenue (annual-prepaid licences)"
              series={data.deferredRevenue}
              groups={groups}
            />
            <Row
              label="Equity (retained earnings + opening)"
              series={data.equity}
              groups={groups}
            />
            <TotalRow
              label="Total liabilities & equity"
              series={data.totalLiabilitiesAndEquity}
              groups={groups}
            />

            <CheckRow
              label="Check (Assets − L&E)"
              a={data.totalAssets}
              b={data.totalLiabilitiesAndEquity}
              groups={groups}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function totalCols(groups: FYGroup[]): number {
  return 1 + groups.reduce((acc, g) => acc + g.months.length + 1, 0);
}

function SectionHeader({
  label,
  color,
  colSpan,
}: {
  label: string;
  color: string;
  colSpan: number;
}) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className={`border-b border-t-2 border-zinc-400 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${color}`}
      >
        {label}
      </td>
    </tr>
  );
}

function Row({
  label,
  series,
  groups,
  subtle = false,
  negative = false,
}: {
  label: string;
  series: SerializedSeries;
  groups: FYGroup[];
  subtle?: boolean;
  negative?: boolean;
}) {
  const labelClass = subtle ? "text-zinc-500" : "font-medium text-zinc-800";
  return (
    <tr className="hover:bg-yellow-50/40">
      <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-100 bg-white px-3 py-1.5">
        <span className={labelClass}>{label}</span>
      </td>
      {groups.map((g) => {
        const close = fyEnd(series, g.months);
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => {
              const v = valueAt(series, pk);
              const display = negative ? -Math.abs(v) : v;
              return (
                <td
                  key={`${label}-${pk}`}
                  className="border-b border-zinc-100 px-2 py-1 text-right tabular-nums text-zinc-700"
                >
                  {v === 0 ? <span className="text-zinc-300">—</span> : fmtNum0(display)}
                </td>
              );
            })}
            <td className="border-b border-r border-zinc-200 bg-zinc-50/40 px-2 py-1 text-right font-semibold tabular-nums text-zinc-900">
              {close === 0 ? (
                <span className="text-zinc-300">—</span>
              ) : (
                fmtNum0(negative ? -Math.abs(close) : close)
              )}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function TotalRow({
  label,
  series,
  groups,
}: {
  label: string;
  series: SerializedSeries;
  groups: FYGroup[];
}) {
  return (
    <tr className="bg-zinc-100 font-semibold text-zinc-900">
      <td className="sticky left-0 z-20 border-r border-t-2 border-zinc-400 bg-zinc-100 px-3 py-1.5">
        {label}
      </td>
      {groups.map((g) => {
        const close = fyEnd(series, g.months);
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => (
              <td
                key={`${label}-${pk}`}
                className="border-t-2 border-zinc-400 px-2 py-1.5 text-right tabular-nums"
              >
                {fmtNum0(valueAt(series, pk))}
              </td>
            ))}
            <td className="border-r border-t-2 border-zinc-400 bg-zinc-200 px-2 py-1.5 text-right tabular-nums">
              {fmtNum0(close)}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function CheckRow({
  label,
  a,
  b,
  groups,
}: {
  label: string;
  a: SerializedSeries;
  b: SerializedSeries;
  groups: FYGroup[];
}) {
  return (
    <tr className="text-zinc-500">
      <td className="sticky left-0 z-20 border-r border-t border-zinc-200 bg-white px-3 py-1.5 text-[11px] italic">
        {label}
      </td>
      {groups.map((g) => {
        const aClose = fyEnd(a, g.months);
        const bClose = fyEnd(b, g.months);
        const driftClose = aClose - bClose;
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => {
              const drift = valueAt(a, pk) - valueAt(b, pk);
              return (
                <td
                  key={`${label}-${pk}`}
                  className="border-t border-zinc-200 px-2 py-1 text-right tabular-nums"
                >
                  {Math.abs(drift) < 0.5 ? (
                    <span className="text-emerald-600">✓</span>
                  ) : (
                    <span className="text-rose-600">{fmtNum0(drift)}</span>
                  )}
                </td>
              );
            })}
            <td className="border-r border-t border-zinc-200 bg-zinc-50 px-2 py-1 text-right tabular-nums">
              {Math.abs(driftClose) < 0.5 ? (
                <span className="text-emerald-600">✓</span>
              ) : (
                <span className="text-rose-600">{fmtNum0(driftClose)}</span>
              )}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-zinc-400">{label}</span>{" "}
      <span className="font-semibold text-zinc-700">{value}</span>
    </span>
  );
}
