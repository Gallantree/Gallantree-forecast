import type { PnL, PnLSection, MonthlyValue } from "@/engine/pnl";
import {
  PnlClientTable,
  type FYGroup,
  type OpexItemEditTarget,
  type PnlCascadeSeries,
  type SerializedLine,
  type SerializedSection,
} from "./PnlClientTable";

export { type FYGroup };

export function buildFYGroups(periods: { key: string; fiscalYear: number }[]): FYGroup[] {
  const map = new Map<number, string[]>();
  for (const p of periods) {
    if (!map.has(p.fiscalYear)) map.set(p.fiscalYear, []);
    map.get(p.fiscalYear)!.push(p.key);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, months]) => ({ fy, months }));
}

function serializeMonthly(series: MonthlyValue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of series) out[m.periodKey] = m.value.toFixed(2);
  return out;
}

function serializeSection(s: PnLSection): SerializedSection {
  const lines: SerializedLine[] = s.lines.map((l) => ({
    accountCode: l.accountCode,
    monthly: serializeMonthly(l.monthly),
    items: l.items.map((i) => ({
      id: i.id,
      label: i.label,
      source: i.source,
      monthly: serializeMonthly(i.monthly),
    })),
  }));
  return { lines, totals: serializeMonthly(s.totals) };
}

export function PnlTable({
  pnl,
  groups,
  accountByCode,
  showSection = "both",
  opexItemEditTargets,
  expenseAccounts,
  defaultStartPeriod,
  cascade,
}: {
  pnl: PnL;
  groups: FYGroup[];
  accountByCode: Map<string, string>;
  showSection?: "both" | "revenue" | "opex";
  opexItemEditTargets?: Record<string, OpexItemEditTarget>;
  expenseAccounts?: { code: string; name: string }[];
  defaultStartPeriod?: string;
  cascade?: PnlCascadeSeries;
}) {
  const accountByCodeObj: Record<string, string> = {};
  for (const [k, v] of accountByCode) accountByCodeObj[k] = v;

  const revenue =
    showSection === "both" || showSection === "revenue"
      ? serializeSection(pnl.revenue)
      : undefined;
  const opex =
    showSection === "both" || showSection === "opex" ? serializeSection(pnl.opex) : undefined;
  const grossProfit =
    showSection === "both" ? serializeMonthly(pnl.grossProfit) : undefined;

  return (
    <PnlClientTable
      horizon={pnl.horizon}
      groups={groups}
      accountByCode={accountByCodeObj}
      revenue={revenue}
      opex={opex}
      grossProfit={grossProfit}
      showSection={showSection}
      opexItemEditTargets={opexItemEditTargets}
      expenseAccounts={expenseAccounts}
      defaultStartPeriod={defaultStartPeriod}
      cascade={cascade}
    />
  );
}
