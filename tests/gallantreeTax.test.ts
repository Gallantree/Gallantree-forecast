import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import {
  buildGallantreeMonthlyView,
  type GallantreeMonthlyView,
} from "../src/app/scenarios/[id]/_components/gallantreeStatements";
import {
  type OverviewData,
  toGallantreeOverview,
} from "../src/app/scenarios/[id]/_components/overviewData";
import { toGallantreePnl } from "../src/app/scenarios/[id]/_components/PnlTable";
import type { MonthlyValue, PnL } from "../src/engine/pnl";
import type { Statements } from "../src/engine/statements";
import { money } from "../src/utils/money";

// Regression suite for the Gallantree-cascade tax bug. Before the fix, all
// three transforms (FY-aggregated overview, per-month PnlTable, and the
// monthly-view helper feeding the Scenario Analysis snapshot) re-derived an
// "implied effective tax rate" from the original full cascade as
// origTax / origPretax. That ratio could go negative (and absurdly large in
// magnitude) when program-tranche interest pushed origPretax below zero
// while individual positive-pretax months still booked origTax. Applying
// that rate to the Gallantree pretax then produced a phantom tax *refund*
// that inflated net income — in one observed scenario, CY30 jumped from
// ~$8.9M to ~$89.6M of net income.
//
// All three transforms now apply the engine's own rule directly:
//   tax = max(0, gallantreePretax) × taxRatePct
// with an explicit-rate prop and a fallback to the rate implied by
// POSITIVE-pretax FYs/months only (so a partial original cascade still
// gives a sensible rate when the caller didn't pass one in).

// ── Fixtures ───────────────────────────────────────────────────────────────

function ovLine(
  accountCode: string,
  fyTotals: number[],
): OverviewData["revenueLines"][number] {
  return {
    accountCode,
    accountName: accountCode,
    fyTotals,
    total: fyTotals.reduce((a, b) => a + b, 0),
  };
}

function makeOverview(opts: {
  // Per-CY: gallantreeRevenue, nimRevenue, opex, ebit, origPretax, origTax
  fys: number[];
  gallantreeRevenue: number[];
  nimRevenue: number[];
  opex: number[];
  ebitda: number[];
  ebit: number[];
  origPretax: number[];
  origTax: number[];
}): OverviewData {
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const totalRevenue = opts.gallantreeRevenue.map((v, i) => v + opts.nimRevenue[i]);
  return {
    fys: opts.fys,
    revenueLines: [
      ovLine("4500", opts.gallantreeRevenue), // Mgmt fee (kept)
      ovLine("4100", opts.nimRevenue), // NIM (dropped)
    ],
    opexLines: [ovLine("6000", opts.opex)],
    liabilityLines: [],
    liabilityTotalsByYear: opts.fys.map(() => 0),
    liabilityTotal: 0,
    totals: {
      revenue: totalRevenue,
      opex: opts.opex,
      depreciation: opts.fys.map(() => 0),
      issuanceAmortisation: opts.fys.map(() => 0),
      interestExpense: opts.origPretax.map((pre, i) => opts.ebit[i] - pre),
      ebitda: opts.ebitda,
      ebit: opts.ebit,
      pretaxIncome: opts.origPretax,
      tax: opts.origTax,
      netIncome: opts.origPretax.map((p, i) => p - opts.origTax[i]),
    },
    fiveYear: {
      revenue: sum(totalRevenue),
      opex: sum(opts.opex),
      depreciation: 0,
      issuanceAmortisation: 0,
      interestExpense: sum(opts.origPretax.map((pre, i) => opts.ebit[i] - pre)),
      ebitda: sum(opts.ebitda),
      ebit: sum(opts.ebit),
      pretaxIncome: sum(opts.origPretax),
      tax: sum(opts.origTax),
      netIncome: sum(opts.origPretax) - sum(opts.origTax),
    },
  };
}

// ── toGallantreeOverview ───────────────────────────────────────────────────

describe("toGallantreeOverview · tax", () => {
  it("uses explicit taxRatePct against gallantree pretax", () => {
    // Simple case: NIM revenue = 0, so gallantree pretax == ebit. Tax should
    // be 30% × max(0, pretax).
    const data = makeOverview({
      fys: [2026, 2027, 2028, 2029, 2030],
      gallantreeRevenue: [1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000],
      nimRevenue: [0, 0, 0, 0, 0],
      opex: [800_000, 800_000, 800_000, 800_000, 800_000],
      ebitda: [200_000, 1_200_000, 2_200_000, 3_200_000, 4_200_000],
      ebit: [200_000, 1_200_000, 2_200_000, 3_200_000, 4_200_000],
      origPretax: [200_000, 1_200_000, 2_200_000, 3_200_000, 4_200_000],
      origTax: [60_000, 360_000, 660_000, 960_000, 1_260_000],
    });

    const g = toGallantreeOverview(data, "30");

    expect(g.totals.tax.map((t) => Math.round(t))).toEqual([
      60_000, 360_000, 660_000, 960_000, 1_260_000,
    ]);
    expect(Math.round(g.fiveYear.tax)).toBe(3_300_000);
  });

  it("floors gallantree tax at 0 when gallantree pretax is negative", () => {
    // Strip a chunk of revenue (NIM) so gallantree pretax goes negative in
    // CY26 even though origPretax was positive.
    const data = makeOverview({
      fys: [2026, 2027],
      gallantreeRevenue: [500_000, 3_000_000],
      nimRevenue: [2_000_000, 0],
      opex: [1_000_000, 1_000_000],
      ebitda: [1_500_000, 2_000_000],
      ebit: [1_500_000, 2_000_000],
      origPretax: [1_500_000, 2_000_000],
      origTax: [450_000, 600_000],
    });

    const g = toGallantreeOverview(data, "30");

    // CY26 gallantree pretax = 500k - 1M = -500k → tax 0, NI -500k.
    // CY27 gallantree pretax = 3M - 1M = 2M → tax 600k, NI 1.4M.
    expect(g.totals.pretaxIncome).toEqual([-500_000, 2_000_000]);
    expect(g.totals.tax).toEqual([0, 600_000]);
    expect(g.totals.netIncome).toEqual([-500_000, 1_400_000]);
  });

  it("never produces a negative tax even when original cascade has a wonky implied rate", () => {
    // Pathological case the regression is about: origPretax sum across FY is
    // *negative* (program-tranche interest dwarfed operating income) but
    // origTax is positive (positive-pretax months still booked tax). The
    // pre-fix implied rate origTax/origPretax was negative, and applied to
    // a positive gallantree pretax produced a phantom refund.
    const data = makeOverview({
      fys: [2030],
      gallantreeRevenue: [13_000_000],
      nimRevenue: [50_000_000],
      opex: [500_000],
      ebitda: [62_500_000],
      ebit: [62_500_000],
      // Original pretax driven negative by program interest.
      origPretax: [-12_000_000],
      // But individual positive-pretax months inside the FY still booked
      // tax. Engine never produces a NEGATIVE tax — `max(0, monthly_pretax) ×
      // rate` — but the FY sum can be positive even when FY pretax is
      // negative.
      origTax: [4_500_000],
    });

    const g = toGallantreeOverview(data, "30");

    // Gallantree pretax should be positive (13M − 500k = 12.5M). Without the
    // fix this row would produce tax ≈ 12.5M × (-4.5M / -12M) → wrong sign,
    // or worse, applied as a refund.
    expect(g.totals.pretaxIncome[0]).toBe(12_500_000);
    // Tax = 30% × 12.5M = 3.75M, NOT a -77M refund.
    expect(g.totals.tax[0]).toBeCloseTo(3_750_000, 2);
    expect(g.totals.netIncome[0]).toBeCloseTo(8_750_000, 2);
  });

  it("falls back to implied rate from positive-pretax FYs when no taxRatePct passed", () => {
    // Caller didn't supply taxRatePct → the helper averages the implied rate
    // across positive-pretax FYs only. Origin tax rate looks like ~30%.
    const data = makeOverview({
      fys: [2026, 2027, 2028],
      gallantreeRevenue: [1_000_000, 2_000_000, 3_000_000],
      nimRevenue: [0, 0, 0],
      opex: [500_000, 500_000, 500_000],
      ebitda: [500_000, 1_500_000, 2_500_000],
      ebit: [500_000, 1_500_000, 2_500_000],
      origPretax: [500_000, 1_500_000, -2_000_000], // last FY negative
      origTax: [150_000, 450_000, 600_000], // pre-fix sum: 1.2M, sum pretax 0 → div/0
    });

    const g = toGallantreeOverview(data); // no rate passed

    // Effective rate from positive FYs only = (150k + 450k) / (500k + 1.5M)
    // = 600k / 2M = 30%. Pretax for last FY = 2.5M (positive on Gallantree
    // since we didn't drop NIM), tax = 750k.
    expect(g.totals.tax[0]).toBeCloseTo(150_000, 0);
    expect(g.totals.tax[1]).toBeCloseTo(450_000, 0);
    expect(g.totals.tax[2]).toBeCloseTo(750_000, 0);
  });
});

// ── toGallantreePnl ────────────────────────────────────────────────────────

function makePnl(opts: {
  horizon: string[];
  gallantreeRevByMonth: number[];
  nimRevByMonth: number[];
  opexByMonth: number[];
}): PnL {
  const { horizon, gallantreeRevByMonth, nimRevByMonth, opexByMonth } = opts;
  const monthly = (vals: number[]): MonthlyValue[] =>
    horizon.map((pk, i) => ({ periodKey: pk, value: money(vals[i]) }));
  const revTotals = horizon.map((pk, i) => ({
    periodKey: pk,
    value: money(gallantreeRevByMonth[i] + nimRevByMonth[i]),
  }));
  const opexTotals = monthly(opexByMonth);
  const grossProfit = horizon.map((pk, i) => ({
    periodKey: pk,
    value: revTotals[i].value.minus(opexTotals[i].value),
  }));
  const totalRev = revTotals.reduce((acc, m) => acc.plus(m.value), money(0));
  const totalOpex = opexTotals.reduce((acc, m) => acc.plus(m.value), money(0));
  return {
    horizon,
    revenue: {
      lines: [
        {
          accountCode: "4500",
          driverIds: [],
          items: [],
          monthly: monthly(gallantreeRevByMonth),
          total: monthly(gallantreeRevByMonth).reduce((acc, m) => acc.plus(m.value), money(0)),
        },
        {
          accountCode: "4100",
          driverIds: [],
          items: [],
          monthly: monthly(nimRevByMonth),
          total: monthly(nimRevByMonth).reduce((acc, m) => acc.plus(m.value), money(0)),
        },
      ],
      totals: revTotals,
      total: totalRev,
    },
    opex: {
      lines: [],
      totals: opexTotals,
      total: totalOpex,
    },
    liabilities: { lines: [], totals: monthly(horizon.map(() => 0)), total: money(0) },
    grossProfit,
    grossProfitTotal: grossProfit.reduce((acc, m) => acc.plus(m.value), money(0)),
  };
}

function makeCascade(opts: {
  horizon: string[];
  ebit: number[];
  origPretax: number[];
  origTax: number[];
}) {
  const m = (vals: number[]): Record<string, string> => {
    const out: Record<string, string> = {};
    for (let i = 0; i < opts.horizon.length; i += 1) out[opts.horizon[i]] = vals[i].toFixed(2);
    return out;
  };
  const zero = m(opts.horizon.map(() => 0));
  return {
    ebitda: m(opts.ebit),
    depreciation: zero,
    issuanceAmortisation: zero,
    ebit: m(opts.ebit),
    interestExpense: m(opts.ebit.map((e, i) => e - opts.origPretax[i])),
    pretaxIncome: m(opts.origPretax),
    taxExpense: m(opts.origTax),
    netIncome: m(opts.origPretax.map((p, i) => p - opts.origTax[i])),
  };
}

describe("toGallantreePnl · tax", () => {
  it("computes monthly tax against gallantree pretax using explicit rate", () => {
    const horizon = ["2026-01", "2026-02", "2026-03"];
    const pnl = makePnl({
      horizon,
      gallantreeRevByMonth: [100_000, 200_000, 300_000],
      nimRevByMonth: [0, 0, 0],
      opexByMonth: [50_000, 50_000, 50_000],
    });
    const cascade = makeCascade({
      horizon,
      ebit: [50_000, 150_000, 250_000],
      origPretax: [50_000, 150_000, 250_000],
      origTax: [15_000, 45_000, 75_000],
    });

    const { cascade: c } = toGallantreePnl(pnl, cascade, "30");
    expect(c).toBeDefined();
    if (!c) return;

    // Gallantree pretax = ebit (no liability interest). Tax = 30% × pretax.
    expect(new Decimal(c.taxExpense["2026-01"]).toNumber()).toBeCloseTo(15_000, 2);
    expect(new Decimal(c.taxExpense["2026-02"]).toNumber()).toBeCloseTo(45_000, 2);
    expect(new Decimal(c.taxExpense["2026-03"]).toNumber()).toBeCloseTo(75_000, 2);
  });

  it("does not generate a refund when origPretax is negative but origTax is positive", () => {
    // Regression: month with origPretax=-1M, origTax=300k (positive-pretax
    // months in the same FY supplied the tax). Pre-fix implied rate would
    // be -0.3, applied to gallantree pretax of +500k → -150k tax (refund).
    const horizon = ["2030-12"];
    const pnl = makePnl({
      horizon,
      gallantreeRevByMonth: [600_000],
      nimRevByMonth: [0],
      opexByMonth: [100_000],
    });
    const cascade = makeCascade({
      horizon,
      ebit: [500_000],
      origPretax: [-1_000_000], // dragged negative by program interest
      origTax: [300_000], // booked from positive-pretax months elsewhere
    });

    const { cascade: c } = toGallantreePnl(pnl, cascade, "30");
    expect(c).toBeDefined();
    if (!c) return;

    // Tax must be positive (30% of 500k = 150k), NOT a -150k refund.
    expect(new Decimal(c.taxExpense["2030-12"]).toNumber()).toBeCloseTo(150_000, 2);
    expect(new Decimal(c.netIncome["2030-12"]).toNumber()).toBeCloseTo(350_000, 2);
  });

  it("floors monthly tax at 0 when gallantree pretax is negative", () => {
    const horizon = ["2026-01"];
    const pnl = makePnl({
      horizon,
      gallantreeRevByMonth: [50_000],
      nimRevByMonth: [0],
      opexByMonth: [200_000],
    });
    const cascade = makeCascade({
      horizon,
      ebit: [-150_000],
      origPretax: [-150_000],
      origTax: [0],
    });

    const { cascade: c } = toGallantreePnl(pnl, cascade, "30");
    expect(c).toBeDefined();
    if (!c) return;
    expect(new Decimal(c.taxExpense["2026-01"]).toNumber()).toBe(0);
    expect(new Decimal(c.netIncome["2026-01"]).toNumber()).toBeCloseTo(-150_000, 2);
  });
});

// ── buildGallantreeMonthlyView ─────────────────────────────────────────────

function makeStatements(opts: {
  horizon: string[];
  gallantreeRevByMonth: number[];
  nimRevByMonth: number[];
  opexByMonth: number[];
  ebitda: number[];
  ebit: number[];
  origPretax: number[];
  origTax: number[];
}): Statements {
  const { horizon } = opts;
  const monthly = (vals: number[]): MonthlyValue[] =>
    horizon.map((pk, i) => ({ periodKey: pk, value: money(vals[i]) }));
  const revTotals = monthly(opts.gallantreeRevByMonth.map((v, i) => v + opts.nimRevByMonth[i]));
  const opexTotals = monthly(opts.opexByMonth);
  const zeros = monthly(horizon.map(() => 0));
  return {
    horizon,
    pnl: {
      horizon,
      revenue: {
        lines: [
          {
            accountCode: "4500",
            driverIds: [],
            items: [],
            monthly: monthly(opts.gallantreeRevByMonth),
            total: monthly(opts.gallantreeRevByMonth).reduce(
              (acc, m) => acc.plus(m.value),
              money(0),
            ),
          },
          {
            accountCode: "4100",
            driverIds: [],
            items: [],
            monthly: monthly(opts.nimRevByMonth),
            total: monthly(opts.nimRevByMonth).reduce((acc, m) => acc.plus(m.value), money(0)),
          },
        ],
        totals: revTotals,
        total: revTotals.reduce((acc, m) => acc.plus(m.value), money(0)),
      },
      opex: {
        lines: [],
        totals: opexTotals,
        total: opexTotals.reduce((acc, m) => acc.plus(m.value), money(0)),
      },
      liabilities: { lines: [], totals: zeros, total: money(0) },
      grossProfit: zeros,
      grossProfitTotal: money(0),
      depreciation: zeros,
      issuanceAmortisation: zeros,
      interestExpense: monthly(opts.ebit.map((e, i) => e - opts.origPretax[i])),
      ebitda: monthly(opts.ebitda),
      ebit: monthly(opts.ebit),
      pretaxIncome: monthly(opts.origPretax),
      taxExpense: monthly(opts.origTax),
      netIncome: monthly(opts.origPretax.map((p, i) => p - opts.origTax[i])),
      netIncomeTotal: money(0),
    },
    bs: {
      ar: zeros,
      ap: zeros,
      ppeGross: zeros,
      accumulatedDepreciation: zeros,
      ppeNet: zeros,
      prepaidIssuanceCosts: zeros,
      cash: zeros,
      notesPayable: zeros,
      deferredRevenue: zeros,
      totalAssets: zeros,
      equity: zeros,
      totalLiabilitiesAndEquity: zeros,
    },
    cf: {
      netIncome: zeros,
      depreciation: zeros,
      issuanceAmortisation: zeros,
      changeInAr: zeros,
      changeInAp: zeros,
      changeInDeferredRevenue: zeros,
      capexOutflow: zeros,
      issuanceCostOutflow: zeros,
      notesIssuance: zeros,
      notesRepayment: zeros,
      equityProceeds: zeros,
      convertibleProceeds: zeros,
      netCashMovement: zeros,
      endingCash: zeros,
    },
  };
}

function netIncomeAt(view: GallantreeMonthlyView, pk: string): number {
  const m = view.netIncome.find((v) => v.periodKey === pk);
  return m ? Number(m.value.toFixed(2)) : 0;
}

describe("buildGallantreeMonthlyView · tax", () => {
  it("computes tax against gallantree pretax with explicit rate", () => {
    const horizon = ["2026-01", "2026-02"];
    const stmts = makeStatements({
      horizon,
      gallantreeRevByMonth: [1_000_000, 2_000_000],
      nimRevByMonth: [0, 0],
      opexByMonth: [500_000, 500_000],
      ebitda: [500_000, 1_500_000],
      ebit: [500_000, 1_500_000],
      origPretax: [500_000, 1_500_000],
      origTax: [150_000, 450_000],
    });

    const view = buildGallantreeMonthlyView(stmts, { taxRatePct: "30" });

    // Net income per month = pretax − 30% × pretax = 70% × pretax.
    expect(netIncomeAt(view, "2026-01")).toBeCloseTo(350_000, 2);
    expect(netIncomeAt(view, "2026-02")).toBeCloseTo(1_050_000, 2);
  });

  it("does not generate refunds from negative origPretax months", () => {
    // Regression for the Scenario Analysis modal: NIM revenue inflates the
    // original cascade so origPretax could be positive while gallantree
    // pretax was negative, or vice versa. With the engine-rule fix this
    // edge case can't produce negative tax.
    const horizon = ["2030-12"];
    const stmts = makeStatements({
      horizon,
      gallantreeRevByMonth: [600_000],
      nimRevByMonth: [0],
      opexByMonth: [100_000],
      ebitda: [500_000],
      ebit: [500_000],
      origPretax: [-2_000_000], // negative
      origTax: [600_000], // booked from elsewhere in the FY
    });

    const view = buildGallantreeMonthlyView(stmts, { taxRatePct: "30" });
    // Tax = 30% × 500k = 150k. Net income = 350k. NOT a refund inflating NI.
    expect(netIncomeAt(view, "2030-12")).toBeCloseTo(350_000, 2);
  });

  it("defaults to 0% tax when no taxRatePct provided", () => {
    const horizon = ["2026-01"];
    const stmts = makeStatements({
      horizon,
      gallantreeRevByMonth: [1_000_000],
      nimRevByMonth: [0],
      opexByMonth: [500_000],
      ebitda: [500_000],
      ebit: [500_000],
      origPretax: [500_000],
      origTax: [150_000],
    });

    const view = buildGallantreeMonthlyView(stmts, {});
    // No taxRatePct → tax 0, net income equals pretax.
    expect(netIncomeAt(view, "2026-01")).toBeCloseTo(500_000, 2);
  });
});
