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

describe("computeStatements — interest expense cascade", () => {
  it("interest expense (program_liability) sits below EBIT, not in EBITDA", () => {
    // Set-up: $10k/mo revenue, $4k/mo opex, plus a $200/mo liability that
    // routes to 6800. EBITDA must equal revenue − cash opex (no interest):
    //   EBITDA = 10,000 − 4,000 = 6,000
    //   EBIT   = 6,000 (no depreciation)
    //   Pre-tax = 6,000 − 200 = 5,800
    //   Tax (30%) = 1,740
    //   NI = 4,060
    const s = computeStatements(
      [rev(), opex()],
      [],
      HORIZON,
      { taxRatePct: "30" },
      [],
      [],
      [],
      [
        {
          id: "L1",
          programId: "P1",
          programName: "Test program",
          trancheName: "AAA",
          principal: "1000000", // $1m
          returnProfileBps: 24, // 1m × 24/10000 = 2,400/yr = 200/mo
          rateType: "fixed",
          calculationMethod: "monthly",
          accountCode: "6800",
          startPeriodKey: "2026-07",
        },
      ],
    );
    expect(s.pnl.ebitda[0].value.toFixed(2)).toBe("6000.00");
    expect(s.pnl.ebit[0].value.toFixed(2)).toBe("6000.00");
    expect(s.pnl.interestExpense[0].value.toFixed(2)).toBe("200.00");
    expect(s.pnl.pretaxIncome[0].value.toFixed(2)).toBe("5800.00");
    expect(s.pnl.taxExpense[0].value.toFixed(2)).toBe("1740.00");
    expect(s.pnl.netIncome[0].value.toFixed(2)).toBe("4060.00");
  });
});

describe("computeStatements — capital program liabilities on BS/CF", () => {
  it("notes payable balance = active principal; issuance at start, repayment after maturity; BS balances", () => {
    // Tranche active 2026-07 .. 2027-01 (7 months) within a 12-month horizon.
    // Principal $1m, 24bps fixed -> $200/mo interest.
    const s = computeStatements(
      [rev(), opex()],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [],
      [],
      [],
      [
        {
          id: "L1",
          programId: "P1",
          programName: "Test",
          trancheName: "AAA",
          principal: "1000000",
          returnProfileBps: 24,
          rateType: "fixed",
          calculationMethod: "monthly",
          accountCode: "6800",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-01",
        },
      ],
    );
    // Issuance in month 0, repayment in month 7 (after 7 active months 0..6).
    expect(s.cf.notesIssuance[0].value.toFixed(2)).toBe("1000000.00");
    expect(s.cf.notesIssuance[1].value.toFixed(2)).toBe("0.00");
    expect(s.cf.notesRepayment[6].value.toFixed(2)).toBe("0.00");
    expect(s.cf.notesRepayment[7].value.toFixed(2)).toBe("1000000.00");
    // Balance: $1m through month 6, $0 from month 7.
    expect(s.bs.notesPayable[0].value.toFixed(2)).toBe("1000000.00");
    expect(s.bs.notesPayable[6].value.toFixed(2)).toBe("1000000.00");
    expect(s.bs.notesPayable[7].value.toFixed(2)).toBe("0.00");
    // BS balances every month.
    for (let i = 0; i < HORIZON.length; i++) {
      expect(s.bs.totalAssets[i].value.toFixed(2)).toBe(
        s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2),
      );
    }
  });

  it("ramp-up + amortisation scale notes balance, interest, and BS still balances", () => {
    // 3-month ramp, 3-month amort on a 7-month tranche. Principal $1.2m, 60bps
    // -> full-deal monthly interest = $60. With factor: ramp months 0..2 use
    // 1/3, 2/3, 3/3; flat 4..4 = 3/3; amort months 5..6 use 3/3 → 2/3 → 1/3.
    const s = computeStatements(
      [rev()],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [],
      [],
      [],
      [
        {
          id: "L1",
          programId: "P1",
          programName: "Test",
          trancheName: "AAA",
          principal: "1200000",
          returnProfileBps: 60, // 1.2m × 60/10000 / 12 = $600/mo at full
          rateType: "fixed",
          calculationMethod: "monthly",
          accountCode: "6800",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-01",
          rampUpMonths: 3,
          amortisationMonths: 3,
        },
      ],
    );
    // Balance: ramp 400k → 800k → 1.2m → 1.2m (flat), then amort 1.2m → 800k →
    // 400k → 0 (past end). Active months 0..6 (7-month tranche).
    expect(s.bs.notesPayable[0].value.toFixed(2)).toBe("400000.00");
    expect(s.bs.notesPayable[1].value.toFixed(2)).toBe("800000.00");
    expect(s.bs.notesPayable[2].value.toFixed(2)).toBe("1200000.00");
    expect(s.bs.notesPayable[3].value.toFixed(2)).toBe("1200000.00");
    expect(s.bs.notesPayable[4].value.toFixed(2)).toBe("1200000.00");
    expect(s.bs.notesPayable[5].value.toFixed(2)).toBe("800000.00");
    expect(s.bs.notesPayable[6].value.toFixed(2)).toBe("400000.00");
    expect(s.bs.notesPayable[7].value.toFixed(2)).toBe("0.00");
    // Issuance only during ramp; repayment in the amort tail.
    expect(s.cf.notesIssuance[0].value.toFixed(2)).toBe("400000.00");
    expect(s.cf.notesIssuance[1].value.toFixed(2)).toBe("400000.00");
    expect(s.cf.notesIssuance[2].value.toFixed(2)).toBe("400000.00");
    expect(s.cf.notesIssuance[3].value.toFixed(2)).toBe("0.00");
    expect(s.cf.notesRepayment[5].value.toFixed(2)).toBe("400000.00");
    expect(s.cf.notesRepayment[6].value.toFixed(2)).toBe("400000.00");
    expect(s.cf.notesRepayment[7].value.toFixed(2)).toBe("400000.00");
    // Interest scaled by factor.
    expect(s.pnl.interestExpense[0].value.toFixed(2)).toBe("200.00");
    expect(s.pnl.interestExpense[2].value.toFixed(2)).toBe("600.00");
    expect(s.pnl.interestExpense[6].value.toFixed(2)).toBe("200.00");
    // BS balances every month.
    for (let i = 0; i < HORIZON.length; i++) {
      expect(s.bs.totalAssets[i].value.toFixed(2)).toBe(
        s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2),
      );
    }
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
      openingEquity: "0",
    });
    for (let i = 0; i < HORIZON.length; i++) {
      const a = s.bs.totalAssets[i].value.toFixed(2);
      const le = s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2);
      expect(a).toBe(le);
    }
  });

  it("upfront issuance cost: cash out at start, amortised straight-line, BS balances", () => {
    // $12k upfront fee on a 12-month deal. Cash leaves in month 0; $1k/mo
    // expensed for 12 months; prepaid asset starts at $12k and drains to 0.
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: "U1",
          programId: "P1",
          programName: "Test",
          feeName: "Legal counsel",
          category: "legal",
          amount: "12000",
          accountCode: "6900",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-06",
        },
      ],
    );
    // Cash out month 0 = $12k, then $0.
    expect(s.cf.issuanceCostOutflow[0].value.toFixed(2)).toBe("12000.00");
    expect(s.cf.issuanceCostOutflow[1].value.toFixed(2)).toBe("0.00");
    // Amortisation: $1k/mo for 12 months.
    expect(s.cf.issuanceAmortisation[0].value.toFixed(2)).toBe("1000.00");
    expect(s.cf.issuanceAmortisation[11].value.toFixed(2)).toBe("1000.00");
    // Prepaid asset rolls: 11k → 10k → ... → 0.
    expect(s.bs.prepaidIssuanceCosts[0].value.toFixed(2)).toBe("11000.00");
    expect(s.bs.prepaidIssuanceCosts[5].value.toFixed(2)).toBe("6000.00");
    expect(s.bs.prepaidIssuanceCosts[11].value.toFixed(2)).toBe("0.00");
    // BS balances every month.
    for (let i = 0; i < HORIZON.length; i++) {
      expect(s.bs.totalAssets[i].value.toFixed(2)).toBe(
        s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2),
      );
    }
  });

  it("annual-billed compliance licence creates deferred revenue that drains over 12 months", () => {
    // $1,000/seat/mo × 1 seat, no growth, no discount, billed annually upfront.
    // Recognition: $1,000/mo. Billings: $12,000 in month 0, $0 in months 1–11.
    // Deferred revenue: $11k → $10k → … → $0 → $11k (next anniversary).
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { dsoDays: "0", taxRatePct: "0" },
      [],
      [],
      [
        {
          id: "L1",
          name: "Annual SaaS",
          type: "compliance",
          startPeriodKey: "2026-07",
          monthlyFeePerSeat: "1000",
          seatCount: 1,
          billingFrequency: "annual",
        },
      ],
    );
    expect(s.bs.deferredRevenue[0].value.toFixed(2)).toBe("11000.00");
    expect(s.bs.deferredRevenue[5].value.toFixed(2)).toBe("6000.00");
    expect(s.bs.deferredRevenue[11].value.toFixed(2)).toBe("0.00");
    // AR must stay zero — customer paid upfront.
    expect(s.bs.ar[0].value.toFixed(2)).toBe("0.00");
    // BS still balances every period.
    for (let i = 0; i < HORIZON.length; i++) {
      const a = s.bs.totalAssets[i].value.toFixed(2);
      const le = s.bs.totalLiabilitiesAndEquity[i].value.toFixed(2);
      expect(a).toBe(le);
    }
    // Cash inflow in month 0 = full $12k upfront billing.
    expect(s.cf.changeInDeferredRevenue[0].value.toFixed(2)).toBe("11000.00");
    expect(s.bs.cash[0].value.toFixed(2)).toBe("12000.00");
  });
});

describe("computeStatements — types", () => {
  it("accepts empty headcount", () => {
    const headcount: HeadcountInput[] = [];
    const s = computeStatements([rev()], headcount, HORIZON);
    expect(s.horizon).toEqual(HORIZON);
  });
});

describe("computeStatements — program fee ramp & amortisation", () => {
  it("management fee scales by deal-balance factor: 1/3, 2/3, 1.0 during ramp", () => {
    // 60bps on $1.2m basis = $7,200/yr = $600/mo at full deal. Ramp=3.
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [],
      [
        {
          id: "F1",
          programId: "P1",
          programName: "Test program",
          programType: "CRE_CLO",
          feeName: "Senior management",
          category: "senior_mgmt",
          basisAmount: "1200000",
          feeBps: 60,
          accountCode: "4500",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-01",
          rampUpMonths: 3,
          amortisationMonths: 3,
        },
      ],
    );
    // Recognised as revenue (Senior mgmt is not servicing, so no share haircut).
    expect(s.pnl.revenue.totals[0].value.toFixed(2)).toBe("200.00"); // 600 × 1/3
    expect(s.pnl.revenue.totals[1].value.toFixed(2)).toBe("400.00"); // 600 × 2/3
    expect(s.pnl.revenue.totals[2].value.toFixed(2)).toBe("600.00"); // full
    expect(s.pnl.revenue.totals[5].value.toFixed(2)).toBe("400.00"); // amort 2/3
    expect(s.pnl.revenue.totals[6].value.toFixed(2)).toBe("200.00"); // amort 1/3
    expect(s.pnl.revenue.totals[7].value.toFixed(2)).toBe("0.00"); // past end
  });

  it("servicing fee applies Gallantree share ON TOP of ramp factor", () => {
    // 100bps on $1m basis, ramp=2. Full annual = $10k = $833.33/mo gross.
    // Default servicing share = 33% → $275/mo at full deal.
    // Month 0: 1/2 × $275 = $137.5; Month 1: full $275.
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [],
      [
        {
          id: "F1",
          programId: "P1",
          programName: "Test",
          programType: "CRE_CLO",
          feeName: "Servicing",
          category: "servicing",
          basisAmount: "1000000",
          feeBps: 100,
          accountCode: "4520",
          startPeriodKey: "2026-07",
          rampUpMonths: 2,
        },
      ],
    );
    const m0 = Number(s.pnl.revenue.totals[0].value.toFixed(2));
    const m1 = Number(s.pnl.revenue.totals[1].value.toFixed(2));
    expect(m1).toBeCloseTo((10000 / 12) * 0.33, 1);
    expect(m0).toBeCloseTo(m1 / 2, 1);
  });
});

describe("computeStatements — loan revenue ramp via program profile", () => {
  it("scales loan interest by the program's deal-balance factor", () => {
    // $1m loan, 400bps spread, no base rate → 400bps × 1m / 10000 / 12 = $333.33/mo at full.
    // With ramp=3, months 0/1/2 = 1/3, 2/3, 1.0 of full.
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [
        {
          id: "L1",
          loanId: "LN-001",
          capitalProgramId: "P1",
          accountCode: "4100",
          balance: "1000000",
          originationPeriodKey: "2026-07",
          maturityPeriodKey: "2027-06",
          creditSpreadBps: 400,
          programStartPeriodKey: "2026-07",
          programEndPeriodKey: "2027-06",
          rampUpMonths: 3,
        },
      ],
    );
    const full = 1_000_000 * 0.04 / 12; // ≈ 333.33
    expect(Number(s.pnl.revenue.totals[0].value.toFixed(2))).toBeCloseTo(full / 3, 1);
    expect(Number(s.pnl.revenue.totals[1].value.toFixed(2))).toBeCloseTo((full * 2) / 3, 1);
    expect(Number(s.pnl.revenue.totals[2].value.toFixed(2))).toBeCloseTo(full, 1);
  });

  it("loan with no program profile is not scaled (back-compat)", () => {
    const s = computeStatements(
      [],
      [],
      HORIZON,
      { taxRatePct: "0", openingCash: "0", openingEquity: "0" },
      [
        {
          id: "L1",
          loanId: "LN-001",
          capitalProgramId: "P1",
          accountCode: "4100",
          balance: "1000000",
          originationPeriodKey: "2026-07",
          maturityPeriodKey: "2027-06",
          creditSpreadBps: 400,
        },
      ],
    );
    const full = 1_000_000 * 0.04 / 12;
    expect(Number(s.pnl.revenue.totals[0].value.toFixed(2))).toBeCloseTo(full, 1);
    expect(Number(s.pnl.revenue.totals[5].value.toFixed(2))).toBeCloseTo(full, 1);
  });
});

describe("computeStatements — EBITDA cascade with issuance amortisation", () => {
  it("issuance amort is added back for EBITDA and re-deducted for EBIT (parallel to depreciation)", () => {
    // Revenue $10k, opex $4k, no capex. $12k upfront issuance amortised over 12 months → $1k/mo.
    // Effective opex = 4k cash opex + 1k amort = 5k.
    // EBITDA should add back the $1k non-cash amort → 10k − 4k = 6k.
    // EBIT = EBITDA − dep − amort = 6k − 0 − 1k = 5k.
    const s = computeStatements(
      [rev(), opex()],
      [],
      HORIZON,
      { taxRatePct: "0" },
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: "U1",
          programId: "P1",
          programName: "Test",
          feeName: "Legal",
          category: "legal",
          amount: "12000",
          accountCode: "6900",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-06",
        },
      ],
    );
    expect(s.pnl.opex.totals[0].value.toFixed(2)).toBe("5000.00");
    expect(s.pnl.issuanceAmortisation[0].value.toFixed(2)).toBe("1000.00");
    expect(s.pnl.ebitda[0].value.toFixed(2)).toBe("6000.00");
    expect(s.pnl.ebit[0].value.toFixed(2)).toBe("5000.00");
    // Net income reflects the $1k expense pre-tax.
    expect(s.pnl.netIncome[0].value.toFixed(2)).toBe("5000.00");
  });

  it("DPO-based AP excludes both depreciation and issuance amortisation (cashOpex only)", () => {
    // Opex $3k/mo cash + $1k capex depreciation + $1k issuance amort = $5k total opex.
    // DPO = 30 days → AP = cashOpex × 1.0 = $3k (not $5k).
    const s = computeStatements(
      [rev(), opex({ baseMonthly: "3000" }), capex({ cost: "12000" })],
      [],
      HORIZON,
      { dpoDays: "30", taxRatePct: "0" },
      [],
      [],
      [],
      [],
      [],
      [
        {
          id: "U1",
          programId: "P1",
          programName: "Test",
          feeName: "Legal",
          category: "legal",
          amount: "12000",
          accountCode: "6900",
          startPeriodKey: "2026-07",
          endPeriodKey: "2027-06",
        },
      ],
    );
    expect(s.bs.ap[0].value.toFixed(2)).toBe("3000.00");
  });
});

describe("computeStatements — back-compat for existing callers", () => {
  it("works when programUpfrontFees arg is omitted (defaults to empty)", () => {
    const s = computeStatements([rev()], [], HORIZON);
    expect(s.pnl.issuanceAmortisation[0].value.toFixed(2)).toBe("0.00");
    expect(s.cf.issuanceCostOutflow[0].value.toFixed(2)).toBe("0.00");
    expect(s.bs.prepaidIssuanceCosts[0].value.toFixed(2)).toBe("0.00");
  });
});
