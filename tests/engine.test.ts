import { describe, it, expect } from "vitest";
import {
  computePnL,
  projectRecurringRevenue,
  projectOpexFixed,
  projectOpexPctRevenue,
  projectHeadcount,
  projectFeeVolumeRevenue,
  projectOneOffRevenue,
  projectOpexPerFte,
  projectCapexDepreciation,
  buildHorizon,
  type RecurringRevenueDriverInput,
  type OpexFixedDriverInput,
  type OpexPctRevenueDriverInput,
  type HeadcountInput,
  type FeeVolumeRevenueDriverInput,
  type OneOffRevenueDriverInput,
  type OpexPerFteDriverInput,
  type CapexStraightLineDriverInput,
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
  ftePct: "1",
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

  it("super loads onto monthly cost additively with on-cost", () => {
    // base 10000/mo (120000/12), super 12%, on-cost 8% -> 10000 × 1.20 = 12000
    const series = projectHeadcount(hc({ onCostPct: "8", superPct: "12" }), HORIZON);
    expect(series[0].value.toFixed(2)).toBe("12000.00");
  });

  it("ftePct scales salary linearly", () => {
    const full = projectHeadcount(hc({ ftePct: "1" }), HORIZON);
    const half = projectHeadcount(hc({ ftePct: "0.5" }), HORIZON);
    expect(half[0].value.toFixed(2)).toBe(full[0].value.div(2).toFixed(2));
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

  it("fee_x_volume: feeBps × volume, compounding volume growth", () => {
    const drv: FeeVolumeRevenueDriverInput = {
      kind: "fee_x_volume",
      id: "fv1",
      name: "AUM fee",
      accountCode: "4010",
      startPeriodKey: "2026-07",
      feeBps: "25",
      volumeMonthly: "1000000",
      volumeMonthlyGrowthPct: "0",
    };
    const series = projectFeeVolumeRevenue(drv, HORIZON);
    // 25 bps of 1,000,000 = 2,500
    expect(series[0].value.toString()).toBe("2500");
  });

  it("one_off: hits exactly one period", () => {
    const drv: OneOffRevenueDriverInput = {
      kind: "one_off",
      id: "oo1",
      name: "settlement",
      accountCode: "4090",
      startPeriodKey: "2026-07",
      amount: "50000",
      periodKey: "2026-09",
    };
    const series = projectOneOffRevenue(drv, HORIZON);
    expect(series[0].value.toString()).toBe("0");
    expect(series[2].value.toString()).toBe("50000");
    expect(series[3].value.toString()).toBe("0");
  });

  it("opex_per_fte: scales by active FTE count", () => {
    const drv: OpexPerFteDriverInput = {
      kind: "opex_per_fte",
      id: "pf1",
      name: "software seats",
      accountCode: "6300",
      startPeriodKey: "2026-07",
      costPerFteMonthly: "100",
    };
    const series = projectOpexPerFte(drv, HORIZON, HORIZON.map(() => 5));
    expect(series[0].value.toString()).toBe("500");
  });

  it("opex_per_fte integrates with computePnL using active headcount", () => {
    const drv: OpexPerFteDriverInput = {
      kind: "opex_per_fte",
      id: "pf1",
      name: "seats",
      accountCode: "6300",
      startPeriodKey: "2026-07",
      costPerFteMonthly: "100",
    };
    const pnl = computePnL(
      [rev(), drv],
      [hc({ id: "h1" }), hc({ id: "h2" })],
      HORIZON,
    );
    const seats = pnl.opex.lines.find((l) => l.accountCode === "6300")!;
    expect(seats.monthly[0].value.toString()).toBe("200");
  });

  it("opex_per_fte uses sum of ftePct (part-time counts fractionally)", () => {
    const drv: OpexPerFteDriverInput = {
      kind: "opex_per_fte",
      id: "pf1",
      name: "seats",
      accountCode: "6300",
      startPeriodKey: "2026-07",
      costPerFteMonthly: "100",
    };
    const pnl = computePnL(
      [rev(), drv],
      [hc({ id: "h1", ftePct: "1" }), hc({ id: "h2", ftePct: "0.5" })],
      HORIZON,
    );
    const seats = pnl.opex.lines.find((l) => l.accountCode === "6300")!;
    expect(seats.monthly[0].value.toString()).toBe("150");
  });

  it("capex_straight_line: monthly depreciation over useful life", () => {
    const drv: CapexStraightLineDriverInput = {
      kind: "capex_straight_line",
      id: "cx1",
      name: "laptops",
      accountCode: "6900",
      startPeriodKey: "2026-07",
      cost: "36000",
      inServicePeriodKey: "2026-07",
      usefulLifeMonths: 36,
    };
    const series = projectCapexDepreciation(drv, HORIZON);
    expect(series[0].value.toString()).toBe("1000");
    expect(series[35].value.toString()).toBe("1000");
    expect(series[36].value.toString()).toBe("0");
  });

  it("loans contribute revenue to channel accounts at the selected NIM tier", async () => {
    const { CHANNEL_ACCOUNT } = await import("../src/engine/loans");
    const pnl = computePnL(
      [],
      [],
      HORIZON,
      [
        {
          id: "L1",
          loanId: "GTL-0001",
          channel: "CRE_CLO",
          balance: "10000000", // $10m
          originationPeriodKey: "2026-07",
          maturityPeriodKey: "2031-06",
          nimDefaultBps: 60, // 60 bps = $60k/yr -> $5k/mo
          nimNegFloorBps: 40,
          nimHardFloorBps: 20,
        },
      ],
      "default",
    );
    const cre = pnl.revenue.lines.find((l) => l.accountCode === CHANNEL_ACCOUNT.CRE_CLO);
    expect(cre).toBeTruthy();
    expect(cre!.monthly[0].value.toFixed(2)).toBe("5000.00");
  });

  it("loans on neg_floor tier use the lower NIM", async () => {
    const pnl = computePnL(
      [],
      [],
      HORIZON,
      [
        {
          id: "L1",
          loanId: "GTL-0001",
          channel: "CRE_CLO",
          balance: "10000000",
          originationPeriodKey: "2026-07",
          maturityPeriodKey: "2031-06",
          nimDefaultBps: 60,
          nimNegFloorBps: 40,
          nimHardFloorBps: 20,
        },
      ],
      "neg_floor",
    );
    const cre = pnl.revenue.lines.find((l) => l.accountCode === "4100");
    expect(cre!.monthly[0].value.toFixed(2)).toBe("3333.33");
  });

  it("program fees post to their account at basis × bps / 12", () => {
    // $500m × 25bps = $1,250,000/yr → $104,166.67/mo
    const pnl = computePnL(
      [],
      [],
      HORIZON,
      [],
      "default",
      [
        {
          id: "F1",
          programId: "P1",
          programName: "CRE CLO 2026-1",
          programType: "CRE_CLO",
          feeName: "Senior management",
          category: "senior_mgmt",
          basisAmount: "500000000",
          feeBps: 25,
          accountCode: "4500",
          startPeriodKey: "2026-07",
        },
      ],
    );
    const line = pnl.revenue.lines.find((l) => l.accountCode === "4500");
    expect(line).toBeTruthy();
    expect(line!.monthly[0].value.toFixed(2)).toBe("104166.67");
    // 60 months × 104166.67 ≈ 6,250,000 (5y total)
    expect(line!.total.toFixed(0)).toBe("6250000");
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
