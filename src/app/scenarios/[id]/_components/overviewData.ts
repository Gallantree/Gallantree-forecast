// Server-safe types + builder for the Overview tab.
// The OverviewTab renderer is a client component ("use client"); keeping the
// types and the pure data builder in this separate module lets page.tsx call
// buildOverviewData() server-side without dragging the client bundle in.

import type { FYGroup } from "./PnlClientTable";

export interface OverviewLine {
  accountCode: string;
  accountName: string;
  fyTotals: number[]; // one per FY in order
  total: number;
}

export interface OverviewLiabilityLine {
  accountCode: string;
  accountName: string;
  trancheLabel: string; // e.g. "Gallantree CRE CLO 2026 FL-1 · AAA"
  fyTotals: number[];
  total: number;
}

export interface OverviewData {
  fys: number[];
  revenueLines: OverviewLine[];
  opexLines: OverviewLine[];
  liabilityLines: OverviewLiabilityLine[];
  liabilityTotalsByYear: number[];
  liabilityTotal: number;
  totals: {
    revenue: number[];
    opex: number[];
    depreciation: number[];
    interestExpense: number[];
    ebitda: number[];
    ebit: number[];
    pretaxIncome: number[];
    tax: number[];
    netIncome: number[];
  };
  fiveYear: {
    revenue: number;
    opex: number;
    depreciation: number;
    interestExpense: number;
    ebitda: number;
    ebit: number;
    pretaxIncome: number;
    tax: number;
    netIncome: number;
  };
}

interface OverviewMonthlyItem {
  id: string;
  label: string;
  source: string;
  monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[];
}

export function buildOverviewData(
  groups: FYGroup[],
  revenueLines: { accountCode: string; monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[] }[],
  opexLines: { accountCode: string; items: OverviewMonthlyItem[]; monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[] }[],
  pnlExt: {
    revenue: { totals: { periodKey: string; value: { toFixed: (n: number) => string } }[] };
    opex: { totals: { periodKey: string; value: { toFixed: (n: number) => string } }[] };
    liabilities: {
      lines: {
        accountCode: string;
        items: OverviewMonthlyItem[];
        monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[];
      }[];
    };
    depreciation: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    interestExpense: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    ebitda: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    ebit: { periodKey: string; value: { toFixed: (n: number) => string } }[];
    pretaxIncome: { periodKey: string; value: { toFixed: (n: number) => string } }[];
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

  // Liability tranches: each program_liability item gets its own row so the
  // user can see the AAA / Mezz / etc. breakdown rather than just a single
  // 6800 roll-up.
  const liabilityLines: OverviewLiabilityLine[] = [];
  for (const line of pnlExt.liabilities.lines) {
    for (const item of line.items ?? []) {
      const fyTotals = sumByFy(item.monthly);
      liabilityLines.push({
        accountCode: line.accountCode,
        accountName: accountByCode.get(line.accountCode) ?? "",
        trancheLabel: item.label,
        fyTotals,
        total: fyTotals.reduce((a, b) => a + b, 0),
      });
    }
  }
  liabilityLines.sort((a, b) => {
    const byAccount = a.accountCode.localeCompare(b.accountCode);
    return byAccount !== 0 ? byAccount : a.trancheLabel.localeCompare(b.trancheLabel);
  });
  const liabilityTotalsByYear = groups.map((_, i) =>
    liabilityLines.reduce((acc, l) => acc + l.fyTotals[i], 0),
  );
  const liabilityTotal = liabilityTotalsByYear.reduce((a, b) => a + b, 0);

  const revenue = sumByFy(pnlExt.revenue.totals);
  const opex = sumByFy(pnlExt.opex.totals);
  const depreciation = sumByFy(pnlExt.depreciation);
  const interestExpenseTotals = sumByFy(pnlExt.interestExpense);
  const ebitda = sumByFy(pnlExt.ebitda);
  const ebit = sumByFy(pnlExt.ebit);
  const pretaxIncome = sumByFy(pnlExt.pretaxIncome);
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
    liabilityLines,
    liabilityTotalsByYear,
    liabilityTotal,
    totals: {
      revenue,
      opex,
      depreciation,
      interestExpense: interestExpenseTotals,
      ebitda,
      ebit,
      pretaxIncome,
      tax,
      netIncome,
    },
    fiveYear: {
      revenue: sum(revenue),
      opex: sum(opex),
      depreciation: sum(depreciation),
      interestExpense: sum(interestExpenseTotals),
      ebitda: sum(ebitda),
      ebit: sum(ebit),
      pretaxIncome: sum(pretaxIncome),
      tax: sum(tax),
      netIncome: sum(netIncome),
    },
  };
}
