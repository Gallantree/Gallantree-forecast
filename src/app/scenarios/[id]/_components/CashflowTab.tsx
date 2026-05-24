import { Fragment } from "react";
import { fmtMoney2, fmtNum0 } from "@/utils/format";
import type { SerializedSeries } from "./BalanceSheetTab";
import { EditOpeningCashModal } from "./EditOpeningCashModal";
import type { FYGroup } from "./PnlClientTable";

export interface CashflowData {
  horizon: string[];
  groups: FYGroup[];
  netIncome: SerializedSeries;
  depreciation: SerializedSeries;
  issuanceAmortisation: SerializedSeries;
  changeInAr: SerializedSeries;
  changeInAp: SerializedSeries;
  changeInDeferredRevenue: SerializedSeries;
  capexOutflow: SerializedSeries;
  issuanceCostOutflow: SerializedSeries;
  notesIssuance: SerializedSeries;
  notesRepayment: SerializedSeries;
  equityProceeds: SerializedSeries;
  convertibleProceeds: SerializedSeries;
  netCashMovement: SerializedSeries;
  endingCash: SerializedSeries;
  openingCash: string;
  closingCash: string;
  totalNetIncome: string;
  totalCashMovement: string;
}

function valueAt(series: SerializedSeries, periodKey: string): number {
  return Number(series.monthly[periodKey] ?? "0");
}

function fySum(series: SerializedSeries, months: string[]): number {
  let s = 0;
  for (const m of months) s += valueAt(series, m);
  return s;
}

function fyEnd(series: SerializedSeries, months: string[]): number {
  if (months.length === 0) return 0;
  return valueAt(series, months[months.length - 1]);
}

function totalCols(groups: FYGroup[]): number {
  return 1 + groups.reduce((acc, g) => acc + g.months.length + 1, 0);
}

export function CashflowTab({ scenarioId, data }: { scenarioId: string; data: CashflowData }) {
  const { groups } = data;
  const operatingFlow: SerializedSeries = {
    monthly: Object.fromEntries(
      data.horizon.map((pk) => [
        pk,
        (
          valueAt(data.netIncome, pk) +
          valueAt(data.depreciation, pk) +
          valueAt(data.issuanceAmortisation, pk) -
          valueAt(data.changeInAr, pk) +
          valueAt(data.changeInAp, pk) +
          valueAt(data.changeInDeferredRevenue, pk) -
          valueAt(data.issuanceCostOutflow, pk)
        ).toFixed(2),
      ]),
    ),
  };
  const totalOperating = data.horizon.reduce((acc, pk) => acc + valueAt(operatingFlow, pk), 0);
  const totalCapex = data.horizon.reduce((acc, pk) => acc + valueAt(data.capexOutflow, pk), 0);
  const totalFinancing = data.horizon.reduce(
    (acc, pk) =>
      acc +
      valueAt(data.notesIssuance, pk) -
      valueAt(data.notesRepayment, pk) +
      valueAt(data.equityProceeds, pk) +
      valueAt(data.convertibleProceeds, pk),
    0,
  );
  const financingFlow: SerializedSeries = {
    monthly: Object.fromEntries(
      data.horizon.map((pk) => [
        pk,
        (
          valueAt(data.notesIssuance, pk) -
          valueAt(data.notesRepayment, pk) +
          valueAt(data.equityProceeds, pk) +
          valueAt(data.convertibleProceeds, pk)
        ).toFixed(2),
      ]),
    ),
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Headline tiles */}
      <div className="grid grid-cols-5 gap-px border-b border-zinc-200 bg-zinc-200">
        <Tile
          label="Opening cash"
          value={fmtMoney2(data.openingCash)}
          action={<EditOpeningCashModal scenarioId={scenarioId} initial={data.openingCash} />}
        />
        <Tile
          label="Operating cash flow (5y)"
          value={fmtMoney2(totalOperating)}
          tone={totalOperating >= 0 ? "ok" : "warn"}
        />
        <Tile
          label="Investing cash (5y)"
          value={fmtMoney2(-totalCapex)}
          tone={totalCapex === 0 ? undefined : "warn"}
        />
        <Tile
          label="Financing cash (5y)"
          value={fmtMoney2(totalFinancing)}
          tone={totalFinancing === 0 ? undefined : totalFinancing >= 0 ? "ok" : "warn"}
        />
        <Tile
          label="Closing cash"
          value={fmtMoney2(data.closingCash)}
          tone={Number(data.closingCash) >= 0 ? "ok" : "warn"}
        />
      </div>

      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
        Indirect method. Monthly cells show the movement that period; CY columns sum flows and show
        the CY-end cash balance.
      </div>

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
                  CY{String(g.fy).slice(-2)}
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
                    CY{String(g.fy).slice(-2)}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionHeader
              label="Operating activities"
              color="bg-emerald-50 text-emerald-800"
              colSpan={totalCols(groups)}
            />
            <FlowRow label="Net income" series={data.netIncome} groups={groups} />
            <FlowRow
              label="+ Depreciation (non-cash add-back)"
              series={data.depreciation}
              groups={groups}
              subtle
            />
            <FlowRow
              label="+ Issuance cost amortisation (non-cash add-back)"
              series={data.issuanceAmortisation}
              groups={groups}
              subtle
            />
            <FlowRow
              label="− Increase in accounts receivable"
              series={data.changeInAr}
              groups={groups}
              subtle
              negate
            />
            <FlowRow
              label="+ Increase in accounts payable"
              series={data.changeInAp}
              groups={groups}
              subtle
            />
            <FlowRow
              label="+ Increase in deferred revenue (annual-prepaid licences)"
              series={data.changeInDeferredRevenue}
              groups={groups}
              subtle
            />
            <FlowRow
              label="− Issuance cost outflow (one-off at deal start)"
              series={data.issuanceCostOutflow}
              groups={groups}
              subtle
              negate
            />
            <SubtotalRow label="Operating cash flow" series={operatingFlow} groups={groups} />

            <SectionHeader
              label="Investing activities"
              color="bg-amber-50 text-amber-800"
              colSpan={totalCols(groups)}
            />
            <FlowRow label="− Capex outflow" series={data.capexOutflow} groups={groups} negate />

            <SectionHeader
              label="Financing activities"
              color="bg-sky-50 text-sky-800"
              colSpan={totalCols(groups)}
            />
            <FlowRow
              label="+ Notes issuance (capital program liabilities)"
              series={data.notesIssuance}
              groups={groups}
            />
            <FlowRow
              label="− Notes repayment (capital program liabilities)"
              series={data.notesRepayment}
              groups={groups}
              negate
            />
            <FlowRow label="+ Equity raise proceeds" series={data.equityProceeds} groups={groups} />
            <FlowRow
              label="+ Convertible note proceeds"
              series={data.convertibleProceeds}
              groups={groups}
            />
            <SubtotalRow label="Financing cash flow" series={financingFlow} groups={groups} />

            <SubtotalRow
              label="Net cash movement"
              series={data.netCashMovement}
              groups={groups}
              variant="grand"
            />

            <BalanceRow label="Ending cash" series={data.endingCash} groups={groups} />
          </tbody>
        </table>
      </div>
    </div>
  );
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

function FlowRow({
  label,
  series,
  groups,
  subtle = false,
  negate = false,
}: {
  label: string;
  series: SerializedSeries;
  groups: FYGroup[];
  subtle?: boolean;
  negate?: boolean;
}) {
  const labelClass = subtle ? "text-zinc-500" : "font-medium text-zinc-800";
  return (
    <tr className="hover:bg-yellow-50/40">
      <td className="sticky left-0 z-20 w-72 border-b border-r border-zinc-100 bg-white px-3 py-1.5">
        <span className={labelClass}>{label}</span>
      </td>
      {groups.map((g) => {
        const fyT = fySum(series, g.months);
        const displayedFy = negate ? -fyT : fyT;
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => {
              const raw = valueAt(series, pk);
              const display = negate ? -raw : raw;
              return (
                <td
                  key={`${label}-${pk}`}
                  className="border-b border-zinc-100 px-2 py-1 text-right tabular-nums text-zinc-700"
                >
                  {raw === 0 ? <span className="text-zinc-300">—</span> : fmtNum0(display)}
                </td>
              );
            })}
            <td className="border-b border-r border-zinc-200 bg-zinc-50/40 px-2 py-1 text-right font-semibold tabular-nums text-zinc-900">
              {fyT === 0 ? <span className="text-zinc-300">—</span> : fmtNum0(displayedFy)}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function SubtotalRow({
  label,
  series,
  groups,
  variant = "section",
}: {
  label: string;
  series: SerializedSeries;
  groups: FYGroup[];
  variant?: "section" | "grand";
}) {
  const cls =
    variant === "grand"
      ? "bg-zinc-200 font-bold text-zinc-900"
      : "bg-zinc-100 font-semibold text-zinc-900";
  const border = "border-t-2 border-zinc-400";
  return (
    <tr className={cls}>
      <td className={`sticky left-0 z-20 ${border} border-r bg-inherit px-3 py-1.5`}>{label}</td>
      {groups.map((g) => {
        const fyT = fySum(series, g.months);
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => (
              <td
                key={`${label}-${pk}`}
                className={`${border} px-2 py-1.5 text-right tabular-nums`}
              >
                {fmtNum0(valueAt(series, pk))}
              </td>
            ))}
            <td className={`${border} border-r bg-zinc-200 px-2 py-1.5 text-right tabular-nums`}>
              {fmtNum0(fyT)}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function BalanceRow({
  label,
  series,
  groups,
}: {
  label: string;
  series: SerializedSeries;
  groups: FYGroup[];
}) {
  return (
    <tr className="border-t border-zinc-200 text-zinc-700">
      <td className="sticky left-0 z-20 w-72 border-r border-zinc-200 bg-white px-3 py-1.5 text-[11px] italic">
        {label} <span className="text-zinc-400">(period-end balance)</span>
      </td>
      {groups.map((g) => {
        const close = fyEnd(series, g.months);
        return (
          <Fragment key={`${label}-fy${g.fy}`}>
            {g.months.map((pk) => {
              const v = valueAt(series, pk);
              return (
                <td
                  key={`${label}-${pk}`}
                  className="px-2 py-1 text-right tabular-nums text-zinc-600"
                >
                  {fmtNum0(v)}
                </td>
              );
            })}
            <td className="border-r border-zinc-200 bg-zinc-50 px-2 py-1 text-right font-semibold tabular-nums text-zinc-900">
              {fmtNum0(close)}
            </td>
          </Fragment>
        );
      })}
    </tr>
  );
}

function Tile({
  label,
  value,
  tone,
  action,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
  action?: React.ReactNode;
}) {
  const valueClass =
    tone === "warn" ? "text-rose-700" : tone === "ok" ? "text-emerald-700" : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </div>
        {action}
      </div>
      <div className={`text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}
