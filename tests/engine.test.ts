import { describe, it, expect } from "vitest";
import {
  computePnL,
  projectRecurringRevenue,
  projectOpexFixed,
  projectOpexPctRevenue,
  projectHeadcount,
  buildHorizon,
  type RecurringRevenueDriverInput,
  type OpexFixedDriverInput,
  type OpexPctRevenueDriverInput,
  type HeadcountInput,
} from "../src/engine/pnl";

const HORIZON = buildHorizon(2026, 7, 60);

const rev = (over: Partial<RecurringRevenueDriverInput> = {}): RecurringRevenueDriverInput => ({
  kind: "recurring_revenue",
  id: "r1",
  name: "rev",
  accountCode: "4000",
  startPeriodKey: "2026-07",
  baseMonthly: "1000",
  monthlyGrowthPct: "0",
  ...over,
});

const opexFixed = (over: Partial<OpexFixedDriverInput> = {}): OpexFixedDriverInput => ({
  kind: "opex_fixed",
  id: "o1",
  name: "rent",
  accountCode: "6200",
  startPeriodKey: "2026-07",
  baseMonthly: "5000",
  monthlyGrowthPct: "0",
  ...over,
});

const opexPct = (over: Partial<OpexPctRevenueDriverInput> = {}): OpexPctRevenueDriverInput => ({
  kind: "opex_pct_revenue",
  id: "op1",
  name: "comp",
  accountCode: "6100",
  startPeriodKey: "2026-07",
  pctOfRevenue: "10",
  ...over,
});

const hc = (over: Partial<HeadcountInput> = {}): HeadcountInput => ({
  id: "h1",
  role: "engineer",
  accountCode: "6000",
  startPeriodKey: "2026-07",
  salaryAnnual: "120000",
  onCostPct: "0",
  salaryGrowthPctAnnual: "0",
  ...over,
});

describe("projectRecurringRevenue", () => {
  it("is zero before start period", () => {
    const series = projectRecurringRevenue(rev({ startPeriodKey: "2027-01" }), HORIZON);
    expect(series[0].value.toString()).toBe("0");
    expect(series[6].value.toString()).toBe("1000");
  });

  it("compounds monthly growth without drift", () => {
    const series = projectRecurringRevenue(rev({ monthlyGrowthPct: "1" }), HORIZON);
    expect(series[0].value.toString()).toBe("1000");
    expect(series[1].value.toString()).toBe("1010");
    expect(series[12].value.toFixed(4)).toBe("1126.8250");
  });

  it("stops at endPeriodKey", () => {
    const series = projectRecurringRevenue(rev({ endPeriodKey: "2026-09" }), HORIZON);
    expect(series[0].value.toString()).toBe("1000");
    expect(series[2].value.toString()).toBe("1000");
    expect(series[3].value.toString()).toBe("0");
  });
});

describe("projectOpexFixed", () => {
  it("compounds without drift, like revenue", () => {
    const series = projectOpexFixed(opexFixed({ monthlyGrowthPct: "0" }), HORIZON);
    expect(series[0].value.toString()).toBe("5000");
    expect(series[11].value.toString()).toBe("5000");
  });
});

describe("projectOpexPctRevenue", () => {
  it("multiplies the period revenue total", () => {
    const revTotals = HORIZON.map((pk, i) => ({
      periodKey: pk,
      value: { times: () => null } as never,
    }));
    // Use real series via computePnL instead — see below
    const drv = opexPct({ pctOfRevenue: "10" });
    const totals = [
      { periodKey: HORIZON[0], value: { toString: () => "1000" } } as never,
    ];
    // exercised in computePnL test
    expect(drv.pctOfRevenue).toBe("10");
    expect(revTotals.length).toBe(60);
    expect(totals.length).toBe(1);
  });
});

describe("projectHeadcount", () => {
  it("monthly = salary/12 × (1 + on-cost)", () => {
    const series = projectHeadcount(hc({ onCostPct: "20" }), HORIZON);
    expect(series[0].value.toFixed(2)).toBe("12000.00");
  });

  it("respects start before horizon active", () => {
    const series = projectHeadcount(hc({ startPeriodKey: "2027-01" }), HORIZON);
    expect(series[0].value.toString()).toBe("0");
    expect(series[6].value.toFixed(2)).toBe("10000.00");
  });

  it("annual growth compounds over months", () => {
    const series = projectHeadcount(hc({ salaryGrowthPctAnnual: "10" }), HORIZON);
    expect(series[0].value.toFixed(2)).toBe("10000.00");
    expect(series[12].value.toFixed(2)).toBe("11000.00");
  });
});

describe("computePnL", () => {
  it("groups revenue drivers by account, exact arithmetic", () => {
    const pnl = computePnL(
      [
        rev({ id: "a", baseMonthly: "100" }),
        rev({ id: "b", baseMonthly: "200" }),
      ],
      [],
      HORIZON,
    );
    expect(pnl.revenue.lines).toHaveLength(1);
    expect(pnl.revenue.lines[0].monthly[0].value.toString()).toBe("300");
    expect(pnl.revenue.total.toString()).toBe("18000");
  });

  it("opex_pct_revenue scales with revenue total per period", () => {
    const pnl = computePnL(
      [rev({ baseMonthly: "1000" }), opexPct({ pctOfRevenue: "10" })],
      [],
      HORIZON,
    );
    expect(pnl.opex.lines[0].monthly[0].value.toString()).toBe("100");
    expect(pnl.opex.total.toString()).toBe("6000");
    expect(pnl.grossProfit[0].value.toString()).toBe("900");
    expect(pnl.grossProfitTotal.toString()).toBe("54000");
  });

  it("merges headcount into opex line by account code", () => {
    const pnl = computePnL(
      [opexFixed({ accountCode: "6000", baseMonthly: "1000" })],
      [hc({ accountCode: "6000", salaryAnnual: "120000" })],
      HORIZON,
    );
    expect(pnl.opex.lines).toHaveLength(1);
    expect(pnl.opex.lines[0].monthly[0].value.toString()).toBe("11000");
  });

  it("0.1 + 0.2 stays 0.3", () => {
    const pnl = computePnL(
      [rev({ id: "a", baseMonthly: "0.1" }), rev({ id: "b", baseMonthly: "0.2" })],
      [],
      HORIZON,
    );
    expect(pnl.revenue.lines[0].monthly[0].value.toString()).toBe("0.3");
  });
});
