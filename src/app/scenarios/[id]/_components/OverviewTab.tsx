import { Fragment } from "react";
import { fmtMoney2 } from "@/utils/format";
import type { FYGroup } from "./PnlClientTable";

export interface OverviewLine {
  accountCode: string;
  accountName: string;
  fyTotals: number[]; // one per FY in order
  total: number;
}

export interface OverviewData {
  fys: number[]; // e.g. [2027, 2028, 2029, 2030, 2031]
  revenueLines: OverviewLine[];
  opexLines: OverviewLine[];
  totals: {
    revenue: number[];
    opex: number[];
    depreciation: number[];
    ebitda: number[];
    ebit: number[];
    tax: number[];
    netIncome: number[];
  };
  fiveYear: {
    revenue: number;
    opex: number;
    depreciation: number;
    ebitda: number;
    ebit: number;
    tax: number;
    netIncome: number;
  };
}

export function buildOverviewData(
  groups: FYGroup[],
  revenueLines: { accountCode: string; monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[] }[],
  opexLines: { accountCode: string; monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[] }[],
  pnlExt: {
    revenue: { totals: { periodKey: string; value: { toFixed: (n: number) => string } }[] };
    opex: { totals: { periodKey: string; value: { toFixed: (n: number) => string } }[] };
    depreciation: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    ebitda: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    ebit: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    taxExpense: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    netIncome: { periodKey: string; value: { toFixed: (n: number) => string } }[];
  },
  accountByCode: Map<string, string>,
): OverviewData {
  const fyMonths = (fy: FYGroup) => new Set(fy.months);
  const sumByFy = (
    series: { periodKey: string; value: { toFixed: (n: number) => string } }[],
  ): number[] =>
    groups.map((g) => {
      const months = fyMonths(g);
      let s = 0;
      for (const m of series) if (months.has(m.periodKey)) s += Number(m.value.toFixed(2));
      return s;
    });

  const lineToOverview = (l: {
    accountCode: string;
    monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[];
  }): OverviewLine => {
    const fyTotals = sumByFy(l.monthly);
    return {
      accountCode: l.accountCode,
      accountName: accountByCode.get(l.accountCode) ?? "",
      fyTotals,
      total: fyTotals.reduce((a, b) => a + b, 0),
    };
  };

  const revenue = sumByFy(pnlExt.revenue.totals);
  const opex = sumByFy(pnlExt.opex.totals);
  const depreciation = sumByFy(pnlExt.depreciation);
  const ebitda = sumByFy(pnlExt.ebitda);
  const ebit = sumByFy(pnlExt.ebit);
  const tax = sumByFy(pnlExt.taxExpense);
  const netIncome = sumByFy(pnlExt.netIncome);

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  return {
    fys: groups.map((g) => g.fy),
    revenueLines: revenueLines.map(lineToOverview).sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode),
    ),
    opexLines: opexLines.map(lineToOverview).sort((a, b) =>
      a.accountCode.localeCompare(b.accountCode),
    ),
    totals: { revenue, opex, depreciation, ebitda, ebit, tax, netIncome },
    fiveYear: {
      revenue: sum(revenue),
      opex: sum(opex),
      depreciation: sum(depreciation),
      ebitda: sum(ebitda),
      ebit: sum(ebit),
      tax: sum(tax),
      netIncome: sum(netIncome),
    },
  };
}

function pct(numer: number, denom: number): string {
  if (denom === 0) return "—";
  return `${((numer / denom) * 100).toFixed(1)}%`;
}

export function OverviewTab({ data }: { data: OverviewData }) {
  const { fys, fiveYear } = data;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Headline tiles */}
      <div className="grid grid-cols-5 gap-px border-b border-zinc-200 bg-zinc-200">
        <Tile label="5y Revenue" value={fmtMoney2(fiveYear.revenue)} />
        <Tile label="5y EBITDA" value={fmtMoney2(fiveYear.ebitda)} tone={fiveYear.ebitda >= 0 ? "ok" : "warn"} />
        <Tile
          label="5y Net income"
          value={fmtMoney2(fiveYear.netIncome)}
          tone={fiveYear.netIncome >= 0 ? "ok" : "warn"}
        />
        <Tile label="EBITDA margin" value={pct(fiveYear.ebitda, fiveYear.revenue)} />
        <Tile label="Net margin" value={pct(fiveYear.netIncome, fiveYear.revenue)} />
      </div>

      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[11px] text-zinc-500">
        Consolidated by fiscal year (Jul → Jun). Each column is the FY total; the right column
        is the 5y total.
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-zinc-600">
            <tr>
              <th className="sticky left-0 z-30 w-80 border-b border-r border-zinc-300 bg-zinc-100 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider">
                Line
              </th>
              {fys.map((fy) => (
                <th
                  key={fy}
                  className="min-w-[120px] border-b border-zinc-300 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider"
                >
                  FY{String(fy).slice(-2)}
                </th>
              ))}
              <th className="min-w-[140px] border-b border-l border-zinc-300 bg-zinc-200 px-3 py-2 text-right text-xs font-bold uppercase tracking-wider">
                5y total
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Revenue */}
            <SectionHeader label="Revenue" color="bg-emerald-50 text-emerald-800" cols={fys.length + 1} />
            {data.revenueLines.map((l) => (
              <DetailRow key={l.accountCode} line={l} />
            ))}
            <TotalRow
              label="Total revenue"
              perFy={data.totals.revenue}
              total={fiveYear.revenue}
            />

            {/* OPEX */}
            <SectionHeader label="Operating expenses" color="bg-rose-50 text-rose-800" cols={fys.length + 1} />
            {data.opexLines.map((l) => (
              <DetailRow key={l.accountCode} line={l} />
            ))}
            <TotalRow
              label="Total OPEX (incl. dep)"
              perFy={data.totals.opex}
              total={fiveYear.opex}
            />

            {/* Profitability cascade */}
            <SectionHeader label="Profitability" color="bg-sky-50 text-sky-800" cols={fys.length + 1} />
            <TotalRow label="EBITDA" perFy={data.totals.ebitda} total={fiveYear.ebitda} />
            <DetailRow
              line={{
                accountCode: "",
                accountName: "Less: Depreciation",
                fyTotals: data.totals.depreciation.map((v) => -Math.abs(v)),
                total: -Math.abs(fiveYear.depreciation),
              }}
            />
            <TotalRow label="EBIT" perFy={data.totals.ebit} total={fiveYear.ebit} />
            <DetailRow
              line={{
                accountCode: "",
                accountName: "Less: Tax",
                fyTotals: data.totals.tax.map((v) => -Math.abs(v)),
                total: -Math.abs(fiveYear.tax),
              }}
            />
            <TotalRow
              label="Net income"
              perFy={data.totals.netIncome}
              total={fiveYear.netIncome}
              variant="grand"
            />

            {/* Margins */}
            <SectionHeader
              label="Margins"
              color="bg-zinc-50 text-zinc-700"
              cols={fys.length + 1}
            />
            <MarginRow
              label="EBITDA margin"
              numer={data.totals.ebitda}
              denom={data.totals.revenue}
              fiveYearNumer={fiveYear.ebitda}
              fiveYearDenom={fiveYear.revenue}
            />
            <MarginRow
              label="Net margin"
              numer={data.totals.netIncome}
              denom={data.totals.revenue}
              fiveYearNumer={fiveYear.netIncome}
              fiveYearDenom={fiveYear.revenue}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  color,
  cols,
}: {
  label: string;
  color: string;
  cols: number;
}) {
  return (
    <tr>
      <td
        colSpan={cols + 1}
        className={`border-b border-t-2 border-zinc-400 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${color}`}
      >
        {label}
      </td>
    </tr>
  );
}

function DetailRow({ line }: { line: OverviewLine }) {
  return (
    <tr className="hover:bg-yellow-50/40">
      <td className="sticky left-0 z-20 w-80 border-b border-r border-zinc-100 bg-white px-4 py-1.5">
        {line.accountCode ? (
          <>
            <span className="font-mono text-zinc-500">{line.accountCode}</span>{" "}
            <span className="text-zinc-800">{line.accountName}</span>
          </>
        ) : (
          <span className="pl-4 text-zinc-600 italic">{line.accountName}</span>
        )}
      </td>
      {line.fyTotals.map((v, i) => (
        <td
          key={i}
          className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums text-zinc-700"
        >
          {v === 0 ? <span className="text-zinc-300">—</span> : fmtMoney2(v)}
        </td>
      ))}
      <td className="border-b border-l border-zinc-200 bg-zinc-50 px-3 py-1.5 text-right font-semibold tabular-nums text-zinc-900">
        {line.total === 0 ? <span className="text-zinc-300">—</span> : fmtMoney2(line.total)}
      </td>
    </tr>
  );
}

function TotalRow({
  label,
  perFy,
  total,
  variant = "section",
}: {
  label: string;
  perFy: number[];
  total: number;
  variant?: "section" | "grand";
}) {
  const cls =
    variant === "grand"
      ? "bg-zinc-200 font-bold text-zinc-900"
      : "bg-zinc-100 font-semibold text-zinc-900";
  return (
    <tr className={cls}>
      <td className="sticky left-0 z-20 border-r border-t-2 border-zinc-400 bg-inherit px-4 py-1.5">
        {label}
      </td>
      {perFy.map((v, i) => (
        <td
          key={i}
          className="border-t-2 border-zinc-400 px-3 py-1.5 text-right tabular-nums"
        >
          {fmtMoney2(v)}
        </td>
      ))}
      <td className="border-l border-t-2 border-zinc-400 bg-zinc-200 px-3 py-1.5 text-right tabular-nums">
        {fmtMoney2(total)}
      </td>
    </tr>
  );
}

function MarginRow({
  label,
  numer,
  denom,
  fiveYearNumer,
  fiveYearDenom,
}: {
  label: string;
  numer: number[];
  denom: number[];
  fiveYearNumer: number;
  fiveYearDenom: number;
}) {
  return (
    <tr className="text-zinc-600">
      <td className="sticky left-0 z-20 w-80 border-b border-r border-zinc-100 bg-white px-4 py-1.5 italic">
        {label}
      </td>
      {numer.map((n, i) => (
        <td
          key={i}
          className="border-b border-zinc-100 px-3 py-1.5 text-right tabular-nums"
        >
          {pct(n, denom[i])}
        </td>
      ))}
      <td className="border-b border-l border-zinc-200 bg-zinc-50 px-3 py-1.5 text-right font-semibold tabular-nums">
        {pct(fiveYearNumer, fiveYearDenom)}
      </td>
    </tr>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn";
}) {
  const valueClass =
    tone === "warn"
      ? "text-rose-700"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-zinc-900";
  return (
    <div className="flex flex-col gap-1 bg-white px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className={`text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

export { Fragment };
