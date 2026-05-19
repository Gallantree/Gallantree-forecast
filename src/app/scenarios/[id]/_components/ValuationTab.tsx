import { Fragment } from "react";
import { fmtMoney2, fmtPercent } from "@/utils/format";
import { updateValuationAssumptions } from "../_actions";
import {
  EditValuationAssumptions,
  type ValuationAssumptionsView,
} from "./EditValuationAssumptions";

export interface ValuationFyAggregate {
  fy: number;
  revenue: string;
  ebitda: string;
  ebit: string;
  netIncome: string;
  fcf: string;
}

export interface ValuationDcfRow {
  horizonYears: number;
  presentValueFcfs: string;
  terminalValue: string;
  presentValueTerminal: string;
  enterpriseValue: string;
  equityValue: string;
  impliedExitMultipleOnEbitda: string;
  invalidReason?: string;
}

export interface ValuationMultipleRow {
  fy: number;
  metric: string;
  multiple: string;
  enterpriseValue: string;
  equityValue: string;
}

export interface ValuationData {
  fys: number[];
  aggregates: ValuationFyAggregate[];
  dcf: ValuationDcfRow[];
  evEbitda: ValuationMultipleRow[];
  evRevenue: ValuationMultipleRow[];
  pe: ValuationMultipleRow[];
  assumptions: ValuationAssumptionsView;
}

export function ValuationTab({ scenarioId, data }: { scenarioId: string; data: ValuationData }) {
  const lastDcf = data.dcf[data.dcf.length - 1];
  const lastEvEbitda = data.evEbitda[data.evEbitda.length - 1];
  const lastEvRevenue = data.evRevenue[data.evRevenue.length - 1];
  const lastPe = data.pe[data.pe.length - 1];

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Headline tiles */}
      <div className="grid grid-cols-4 gap-px border-b border-zinc-200 bg-zinc-200">
        <Tile
          label={`DCF · ${lastDcf.horizonYears}y horizon`}
          value={fmtMoney2(lastDcf.equityValue)}
          sub={`EV ${fmtMoney2(lastDcf.enterpriseValue)}`}
          tone={lastDcf.invalidReason ? "warn" : "ok"}
        />
        <Tile
          label={`EV/EBITDA · FY${String(lastEvEbitda.fy).slice(-2)}`}
          value={fmtMoney2(lastEvEbitda.equityValue)}
          sub={`${data.assumptions.evEbitdaMultiple}x · EV ${fmtMoney2(lastEvEbitda.enterpriseValue)}`}
        />
        <Tile
          label={`EV/Revenue · FY${String(lastEvRevenue.fy).slice(-2)}`}
          value={fmtMoney2(lastEvRevenue.equityValue)}
          sub={`${data.assumptions.evRevenueMultiple}x · EV ${fmtMoney2(lastEvRevenue.enterpriseValue)}`}
        />
        <Tile
          label={`P/E · FY${String(lastPe.fy).slice(-2)}`}
          value={fmtMoney2(lastPe.equityValue)}
          sub={`${data.assumptions.peMultiple}x · NI ${fmtMoney2(lastPe.metric)}`}
        />
      </div>

      {/* Assumptions banner */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-600">
        <Stat label="WACC" value={`${data.assumptions.waccPct}%`} />
        <Stat label="Terminal growth" value={`${data.assumptions.terminalGrowthPct}%`} />
        <Stat label="EV/EBITDA" value={`${data.assumptions.evEbitdaMultiple}x`} />
        <Stat label="EV/Revenue" value={`${data.assumptions.evRevenueMultiple}x`} />
        <Stat label="P/E" value={`${data.assumptions.peMultiple}x`} />
        <Stat label="Net debt" value={fmtMoney2(data.assumptions.netDebt)} />
        <div className="ml-auto">
          <EditValuationAssumptions
            initial={data.assumptions}
            saveAction={updateValuationAssumptions.bind(null, scenarioId)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* FY aggregates */}
        <section className="border-b border-zinc-200">
          <SectionHeader label="FY aggregates (computed)" color="bg-zinc-50 text-zinc-700" />
          <table className="w-full border-collapse text-xs">
            <thead className="bg-zinc-100 text-zinc-600">
              <tr>
                <Th>Metric</Th>
                {data.fys.map((fy) => (
                  <Th key={fy} className="text-right">
                    FY{String(fy).slice(-2)}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AggregateRow label="Revenue" values={data.aggregates.map((a) => a.revenue)} />
              <AggregateRow label="EBITDA" values={data.aggregates.map((a) => a.ebitda)} />
              <AggregateRow label="EBIT" values={data.aggregates.map((a) => a.ebit)} />
              <AggregateRow label="Net income" values={data.aggregates.map((a) => a.netIncome)} />
              <AggregateRow
                label="Free cash flow"
                values={data.aggregates.map((a) => a.fcf)}
                emphasis
              />
            </tbody>
          </table>
        </section>

        {/* DCF */}
        <section className="border-b border-zinc-200">
          <SectionHeader
            label={`DCF by explicit horizon · WACC ${data.assumptions.waccPct}% · g ${data.assumptions.terminalGrowthPct}%`}
            color="bg-emerald-50 text-emerald-800"
          />
          <table className="w-full border-collapse text-xs">
            <thead className="bg-zinc-100 text-zinc-600">
              <tr>
                <Th>Horizon</Th>
                <Th className="text-right">PV of FCFs</Th>
                <Th className="text-right">Terminal value</Th>
                <Th className="text-right">PV of TV</Th>
                <Th className="text-right">Enterprise value</Th>
                <Th className="text-right">Equity value</Th>
                <Th className="text-right">Implied exit × EBITDA</Th>
              </tr>
            </thead>
            <tbody>
              {data.dcf.map((row) => (
                <tr
                  key={row.horizonYears}
                  className="border-b border-zinc-100 hover:bg-yellow-50/40"
                >
                  <Td className="font-medium">{row.horizonYears}-year</Td>
                  <Td className="text-right tabular-nums">{fmtMoney2(row.presentValueFcfs)}</Td>
                  <Td className="text-right tabular-nums">
                    {row.invalidReason ? (
                      <span className="text-rose-600" title={row.invalidReason}>
                        n/a
                      </span>
                    ) : (
                      fmtMoney2(row.terminalValue)
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {row.invalidReason ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      fmtMoney2(row.presentValueTerminal)
                    )}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">
                    {fmtMoney2(row.enterpriseValue)}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums text-emerald-700">
                    {fmtMoney2(row.equityValue)}
                  </Td>
                  <Td className="text-right tabular-nums text-zinc-500">
                    {row.invalidReason ? (
                      <span className="text-zinc-300">—</span>
                    ) : (
                      `${Number(row.impliedExitMultipleOnEbitda).toFixed(1)}x`
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* EV / EBITDA */}
        <MultiplesSection
          title={`EV / EBITDA · ${data.assumptions.evEbitdaMultiple}x`}
          color="bg-sky-50 text-sky-800"
          metricLabel="EBITDA"
          rows={data.evEbitda}
        />
        <MultiplesSection
          title={`EV / Revenue · ${data.assumptions.evRevenueMultiple}x`}
          color="bg-amber-50 text-amber-800"
          metricLabel="Revenue"
          rows={data.evRevenue}
        />
        <MultiplesSection
          title={`P / E · ${data.assumptions.peMultiple}x`}
          color="bg-violet-50 text-violet-800"
          metricLabel="Net income"
          rows={data.pe}
          equityOnly
        />
      </div>
    </div>
  );
}

function MultiplesSection({
  title,
  color,
  metricLabel,
  rows,
  equityOnly = false,
}: {
  title: string;
  color: string;
  metricLabel: string;
  rows: ValuationMultipleRow[];
  equityOnly?: boolean;
}) {
  return (
    <section className="border-b border-zinc-200">
      <SectionHeader label={title} color={color} />
      <table className="w-full border-collapse text-xs">
        <thead className="bg-zinc-100 text-zinc-600">
          <tr>
            <Th>Year</Th>
            <Th className="text-right">{metricLabel}</Th>
            <Th className="text-right">Multiple</Th>
            {!equityOnly && <Th className="text-right">Enterprise value</Th>}
            <Th className="text-right">Equity value</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fy} className="border-b border-zinc-100 hover:bg-yellow-50/40">
              <Td className="font-medium">FY{String(r.fy).slice(-2)}</Td>
              <Td className="text-right tabular-nums">{fmtMoney2(r.metric)}</Td>
              <Td className="text-right tabular-nums text-zinc-500">
                {Number(r.multiple).toFixed(1)}x
              </Td>
              {!equityOnly && (
                <Td className="text-right font-semibold tabular-nums">
                  {fmtMoney2(r.enterpriseValue)}
                </Td>
              )}
              <Td className="text-right font-semibold tabular-nums text-emerald-700">
                {fmtMoney2(r.equityValue)}
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function AggregateRow({
  label,
  values,
  emphasis = false,
}: {
  label: string;
  values: string[];
  emphasis?: boolean;
}) {
  return (
    <tr className={emphasis ? "bg-zinc-50 font-semibold" : ""}>
      <Td className="font-medium text-zinc-800">{label}</Td>
      {values.map((v, i) => (
        <Td key={i} className="text-right tabular-nums">
          {fmtMoney2(v)}
        </Td>
      ))}
    </tr>
  );
}

function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div
      className={`border-b border-t-2 border-zinc-300 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}
    >
      {label}
    </div>
  );
}

function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="text-[10px] text-zinc-500">{sub}</div> : null}
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

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b border-zinc-200 px-3 py-1.5 text-left font-medium ${className}`}>
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td className={`px-3 py-1.5 ${className}`} colSpan={colSpan}>
      {children}
    </td>
  );
}

// Re-export to satisfy any future references
export { Fragment, fmtPercent };
