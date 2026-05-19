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
  revenueLines: {
    accountCode: string;
    monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[];
  }[],
  opexLines: {
    accountCode: string;
    items: OverviewMonthlyItem[];
    monthly: { periodKey: string; value: { toFixed: (n: number) => string } }[];
  }[],
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
    revenueLines: revenueLines
      .map(lineToOverview)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
    opexLines: opexLines
      .map(lineToOverview)
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode)),
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

// ── Gallantree-specific variant ────────────────────────────────────────────
//
// The standard Overview rolls up everything that flows through Gallantree's
// chart of accounts — including the NIM income on the warehoused / securitised
// CRE book (account codes 4100-4499) AND the interest expense Gallantree is
// modelling on the tranches it issues to capital-stack investors.
//
// For the *Gallantree Overview*, we want to see the platform's operating
// economics in isolation: management + servicing fees, platform-licence
// revenue, OPEX, and the resulting profit cascade. The book interest
// (NIM revenue) and the matching liability interest are an investor-pass-
// through view — informative on the program tabs, but noise here.
//
// This variant takes the same builder output and strips:
//   * Revenue lines coded 4100-4499 (NIM revenue buckets — CRE CLO / CMBS /
//     Warehouse / Non-Conforming)
//   * The entire `liabilityLines` section (capital-program tranche interest)
//   * `interestExpense` from every total / cascade (EBIT == Pre-tax income)
//
// Revenue / EBITDA / Net income totals are recomputed so margins stay honest.

const NIM_REVENUE_PATTERN = /^4[1-4]\d\d$/;

function isNimRevenueLine(line: OverviewLine): boolean {
  return NIM_REVENUE_PATTERN.test(line.accountCode);
}

export function toGallantreeOverview(data: OverviewData): OverviewData {
  const revenueLines = data.revenueLines.filter((l) => !isNimRevenueLine(l));

  // Re-sum revenue per FY without the NIM lines so totals & margins reflect
  // only the lines actually displayed.
  const revenue = data.fys.map((_, i) =>
    revenueLines.reduce((acc, l) => acc + (l.fyTotals[i] ?? 0), 0),
  );

  // EBITDA / EBIT / pre-tax all need to back out (a) the NIM revenue we just
  // removed and (b) the interest expense we're hiding. Since net income is
  // pre-tax minus tax, and we're not changing tax behaviour here, we
  // recompute the cascade by deltas from the original totals.
  const revenueDelta = data.totals.revenue.map((v, i) => revenue[i] - v); // ≤ 0
  const ebitda = data.totals.ebitda.map((v, i) => v + revenueDelta[i]);
  const ebit = data.totals.ebit.map((v, i) => v + revenueDelta[i]);
  // Without liability interest, EBIT == pre-tax income.
  const pretaxIncome = ebit.slice();
  // Tax & net income recompute against the new pre-tax. Re-derive the
  // effective tax rate per FY from the original cascade so the implied
  // assumption stays consistent.
  const tax = data.totals.tax.map((origTax, i) => {
    const origPre = data.totals.pretaxIncome[i] ?? 0;
    if (origPre === 0) return 0;
    const rate = origTax / origPre;
    return pretaxIncome[i] * rate;
  });
  const netIncome = pretaxIncome.map((v, i) => v - tax[i]);

  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

  return {
    ...data,
    revenueLines,
    liabilityLines: [],
    liabilityTotalsByYear: data.fys.map(() => 0),
    liabilityTotal: 0,
    totals: {
      revenue,
      opex: data.totals.opex,
      depreciation: data.totals.depreciation,
      interestExpense: data.fys.map(() => 0),
      ebitda,
      ebit,
      pretaxIncome,
      tax,
      netIncome,
    },
    fiveYear: {
      revenue: sum(revenue),
      opex: data.fiveYear.opex,
      depreciation: data.fiveYear.depreciation,
      interestExpense: 0,
      ebitda: sum(ebitda),
      ebit: sum(ebit),
      pretaxIncome: sum(pretaxIncome),
      tax: sum(tax),
      netIncome: sum(netIncome),
    },
  };
}
