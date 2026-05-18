import { describe, it, expect } from "vitest";
import { computeStatements } from "../src/engine/statements";
import {
  buildHorizon,
  type DriverInput,
  type HeadcountInput,
} from "../src/engine/pnl";

const HORIZON = buildHorizon(2026, 7, 12);

const rev = (over: Partial<DriverInput> = {}): DriverInput =>
  ({
    kind: "recurring_revenue",
    id: "r1",
    name: "rev",
    accountCode: "4000",
    startPeriodKey: "2026-07",
    baseMonthly: "10000",
    monthlyGrowthPct: "0",
    ...over,
  }) as DriverInput;

const opex = (over: Partial<DriverInput> = {}): DriverInput =>
  ({
    kind: "opex_fixed",
    id: "o1",
    name: "rent",
    accountCode: "6000",
    startPeriodKey: "2026-07",
    baseMonthly: "4000",
    monthlyGrowthPct: "0",
    ...over,
  }) as DriverInput;

const capex = (over: Partial<DriverInput> = {}): DriverInput =>
  ({
    kind: "capex_straight_line",
    id: "c1",
    name: "laptops",
    accountCode: "6900",
    startPeriodKey: "2026-07",
    cost: "12000",
    inServicePeriodKey: "2026-07",
    usefulLifeMonths: 12,
    ...over,
  }) as DriverInput;

describe("computeStatements — P&L extension", () => {
  it("EBITDA = revenue - cash opex (excludes depreciation)", () => {
    const s = computeStatements([rev(), opex(), capex()], [], HORIZON);
    // rev 10000, cash opex 4000, dep 1000 -> EBITDA 6000, EBIT 5000
    expect(s.pnl.ebitda[0].value.toFixed(2)).toBe("6000.00");
    expect(s.pnl.ebit[0].value.toFixed(2)).toBe("5000.00");
  });

  it("tax applies only to positive EBIT", () => {
    const s = computeStatements([rev(), opex()], [], HORIZON, { taxRatePct: "30" });
    // EBIT 6000, tax 1800, NI 4200
    expect(s.pnl.taxExpense[0].value.toFixed(2)).toBe("1800.00");
    expect(s.pnl.netIncome[0].value.toFixed(2)).toBe("4200.00");
  });

  it("no tax on losses", () => {
    const s = computeStatements(
      [rev({ baseMonthly: "100" }), opex({ baseMonthly: "1000" })],
      [],
      HORIZON,
      { taxRatePct: "30" },
    );
    expect(s.pnl.taxExpense[0].value.toFixed(2)).toBe("0.00");
  });
});

describe("computeStatements — Balance Sheet", () => {
  it("AR = monthly revenue × DSO/30", () => {
    const s = computeStatements([rev()], [], HORIZON, { dsoDays: "30" });
    expect(s.bs.ar[0].value.toFixed(2)).toBe("10000.00");
  });

  it("PPE gross accumulates capex; net = gross - accumulated dep", () => {
    const s = computeStatements([capex()], [], HORIZON);
    expect(s.bs.ppeGross[0].value.toFixed(2)).toBe("12000.00");
    expect(s.bs.accumulatedDepreciation[0].value.toFixed(2)).toBe("1000.00");
    expect(s.bs.ppeNet[0].value.toFixed(2)).toBe("11000.00");
    // after 12 months fully depreciated
    expect(s.bs.ppeNet[11].value.toFixed(2)).toBe("0.00");
  });

  it("equity rolls forward from opening + cumulative net income", () => {
    const s = computeStatements([rev(), opex()], [], HORIZON, {
      openingEquity: "100000",
      taxRatePct: "0",
    });
    expect(s.bs.equity[0].value.toFixed(2)).toBe("106000.00");
  });
});

describe("computeStatements — Cashflow & BS balance", () => {
  it("indirect CF reconciles to ending cash", () => {
    const s = computeStatements([rev(), opex(), capex()], [], HORIZON, {
      dsoDays: "0",
      dpoDays: "0",
      taxRatePct: "0",
      openingCash: "0",
    });
    // monthly: NI = rev - opex - dep = 10000 - 4000 - 1000 = 5000; +dep 1000; -capex 12000 (month 0 only)
    // month 0: 5000 + 1000 + 0 - 0 - 12000 = -6000
    expect(s.cf.netCashMovement[0].value.toFixed(2)).toBe("-6000.00");
    expect(s.cf.endingCash[0].value.toFixed(2)).toBe("-6000.00");
    // month 1: 5000 + 1000 = 6000 -> cash 0
    expect(s.cf.endingCash[1].value.toFixed(2)).toBe("0.00");
  });

  it("balance sheet balances: assets = liabilities + equity", () => {
    const s = computeStatements([rev(), opex(), capex()], [], HORIZON, {
      dsoDays: "45",
      dpoDays: "30",
      taxRatePct: "30",
      openingCash: "50000",
      openingEquity: "50000",
    });
    for (let i = 0; i < HORIZON.length; i++) {
      const a = s.bs.totalAssets[i].value.toFixed(2);
      const le = s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2);
      expect(a).toBe(le);
    }
  });
});

describe("computeStatements — types", () => {
  it("accepts empty headcount", () => {
    const headcount: HeadcountInput[] = [];
    const s = computeStatements([rev()], headcount, HORIZON);
    expect(s.horizon).toEqual(HORIZON);
  });
});
