import { describe, it, expect } from "vitest";
import { computePnL, projectRecurringRevenue, buildHorizon } from "../src/engine/pnl";

const HORIZON = buildHorizon(2026, 7, 60);

describe("projectRecurringRevenue", () => {
  it("is zero before start period", () => {
    const series = projectRecurringRevenue(
      {
        id: "d1",
        name: "x",
        accountCode: "4000",
        startPeriodKey: "2027-01",
        baseMonthly: "1000",
        monthlyGrowthPct: "0",
      },
      HORIZON,
    );
    expect(series[0].value.toString()).toBe("0");
    expect(series[6].value.toString()).toBe("1000");
  });

  it("compounds monthly growth without drift", () => {
    const series = projectRecurringRevenue(
      {
        id: "d1",
        name: "x",
        accountCode: "4000",
        startPeriodKey: "2026-07",
        baseMonthly: "1000",
        monthlyGrowthPct: "1",
      },
      HORIZON,
    );
    expect(series[0].value.toString()).toBe("1000");
    expect(series[1].value.toString()).toBe("1010");
    expect(series[12].value.toFixed(4)).toBe("1126.8250");
  });
});

describe("computePnL", () => {
  it("groups drivers on the same account", () => {
    const pnl = computePnL(
      [
        {
          id: "a",
          name: "fund A",
          accountCode: "4000",
          startPeriodKey: "2026-07",
          baseMonthly: "100",
          monthlyGrowthPct: "0",
        },
        {
          id: "b",
          name: "fund B",
          accountCode: "4000",
          startPeriodKey: "2026-07",
          baseMonthly: "200",
          monthlyGrowthPct: "0",
        },
      ],
      HORIZON,
    );
    expect(pnl.lines).toHaveLength(1);
    expect(pnl.lines[0].monthly[0].value.toString()).toBe("300");
    expect(pnl.revenueTotal.toString()).toBe("18000");
  });

  it("returns no drift on float-traps", () => {
    const pnl = computePnL(
      [
        {
          id: "a",
          name: "x",
          accountCode: "4000",
          startPeriodKey: "2026-07",
          baseMonthly: "0.1",
          monthlyGrowthPct: "0",
        },
        {
          id: "b",
          name: "y",
          accountCode: "4000",
          startPeriodKey: "2026-07",
          baseMonthly: "0.2",
          monthlyGrowthPct: "0",
        },
      ],
      HORIZON,
    );
    expect(pnl.lines[0].monthly[0].value.toString()).toBe("0.3");
  });
});
