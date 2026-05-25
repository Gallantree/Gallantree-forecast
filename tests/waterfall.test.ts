import { describe, it, expect } from "vitest";
import {
  annualFeeAmount,
  trancheAnnualInterest,
  grossCollectionsAllIn,
  equityReturnPct,
  computeWaterfall,
} from "../src/engine/waterfall";

describe("annualFeeAmount", () => {
  it("returns basisAmount × feeBps / 10000", () => {
    expect(annualFeeAmount(10_000_000, 25)).toBeCloseTo(25_000);
  });

  it("returns 0 when feeBps is 0", () => {
    expect(annualFeeAmount(10_000_000, 0)).toBe(0);
  });

  it("returns 0 when basisAmount is 0", () => {
    expect(annualFeeAmount(0, 25)).toBe(0);
  });
});

describe("trancheAnnualInterest", () => {
  it("fixed tranche: uses returnProfileBps only", () => {
    // 100 notes × $1,000 = $100,000 principal; 500 bps = 5%
    expect(trancheAnnualInterest(100, 1_000, 500, "fixed", 420)).toBeCloseTo(5_000);
  });

  it("variable tranche: adds baseRateBps to returnProfileBps", () => {
    // 100 notes × $1,000 = $100,000 principal; spread 355 + base 420 = 775 bps = 7.75%
    expect(trancheAnnualInterest(100, 1_000, 355, "variable", 420)).toBeCloseTo(7_750);
  });

  it("returns 0 when numNotes is 0", () => {
    expect(trancheAnnualInterest(0, 1_000, 500, "fixed", 420)).toBe(0);
  });

  it("returns 0 when faceValuePerNote is 0", () => {
    expect(trancheAnnualInterest(100, 0, 500, "fixed", 420)).toBe(0);
  });
});

describe("grossCollectionsAllIn", () => {
  it("returns totalBalance × (waSpreadBps + baseRateBps) / 10000", () => {
    // $100M balance, 355 bps credit spread + 420 bps base = 775 bps all-in
    expect(grossCollectionsAllIn(100_000_000, 355, 420)).toBeCloseTo(7_750_000);
  });

  it("returns 0 when balance is 0", () => {
    expect(grossCollectionsAllIn(0, 355, 420)).toBe(0);
  });

  it("includes base rate in income (not just credit spread)", () => {
    const spreadOnly = (100_000_000 * 355) / 10000;
    const allIn = grossCollectionsAllIn(100_000_000, 355, 420);
    expect(allIn).toBeGreaterThan(spreadOnly);
  });
});

describe("equityReturnPct", () => {
  it("returns residual / principal × 100", () => {
    expect(equityReturnPct(500_000, 10_000_000)).toBeCloseTo(5);
  });

  it("returns null when equityPrincipal is 0", () => {
    expect(equityReturnPct(500_000, 0)).toBeNull();
  });

  it("returns null when equityPrincipal is negative", () => {
    expect(equityReturnPct(500_000, -1)).toBeNull();
  });

  it("returns negative yield when residual is negative", () => {
    const result = equityReturnPct(-200_000, 10_000_000);
    expect(result).not.toBeNull();
    expect(result!).toBeLessThan(0);
  });
});

describe("computeWaterfall", () => {
  const BASE = {
    totalBalance: 100_000_000,
    waSpreadBps: 355,
    baseRateBps: 420,
    fees: [{ basisAmount: 100_000_000, feeBps: 25 }], // $250k mgmt fee
    debtTranches: [
      { numNotes: 100, faceValuePerNote: 900_000, returnProfileBps: 355, rateType: "variable" as const },
    ],
    equityTranches: [
      { numNotes: 10, faceValuePerNote: 1_000_000, returnProfileBps: 0, rateType: "fixed" as const },
    ],
  };

  it("grossCollections equals all-in rate on total balance", () => {
    const result = computeWaterfall(BASE);
    expect(result.grossCollections).toBeCloseTo(grossCollectionsAllIn(100_000_000, 355, 420));
  });

  it("totalFees sums all fee lines", () => {
    const result = computeWaterfall(BASE);
    expect(result.totalFees).toBeCloseTo(250_000);
  });

  it("totalNoteInterest uses all-in for variable tranches", () => {
    const result = computeWaterfall(BASE);
    // 100 notes × $900k = $90M principal; (355+420) bps = 775 bps
    expect(result.totalNoteInterest).toBeCloseTo((90_000_000 * 775) / 10000);
  });

  it("residual = grossCollections - fees - noteInterest", () => {
    const result = computeWaterfall(BASE);
    expect(result.residual).toBeCloseTo(result.grossCollections - result.totalFees - result.totalNoteInterest);
  });

  it("equityPrincipal = sum of equity tranche notes × face value", () => {
    const result = computeWaterfall(BASE);
    expect(result.equityPrincipal).toBeCloseTo(10_000_000);
  });

  it("equityReturnPct equals residual / equityPrincipal × 100", () => {
    const result = computeWaterfall(BASE);
    expect(result.equityReturnPct).toBeCloseTo((result.residual / result.equityPrincipal) * 100);
  });

  it("returns null equityReturnPct when no equity tranches", () => {
    const result = computeWaterfall({ ...BASE, equityTranches: [] });
    expect(result.equityReturnPct).toBeNull();
    expect(result.equityPrincipal).toBe(0);
  });

  it("multiple fee lines sum correctly", () => {
    const result = computeWaterfall({
      ...BASE,
      fees: [
        { basisAmount: 100_000_000, feeBps: 25 }, // $250k
        { basisAmount: 100_000_000, feeBps: 10 }, // $100k
      ],
    });
    expect(result.totalFees).toBeCloseTo(350_000);
  });

  it("fixed-rate debt tranche does not include base rate", () => {
    const fixedResult = computeWaterfall({
      ...BASE,
      fees: [],
      equityTranches: [],
      debtTranches: [
        { numNotes: 100, faceValuePerNote: 900_000, returnProfileBps: 500, rateType: "fixed" as const },
      ],
    });
    // 500 bps on $90M = $4.5M (no base rate)
    expect(fixedResult.totalNoteInterest).toBeCloseTo(4_500_000);
  });

  it("residual can go negative (over-allocated structure)", () => {
    const result = computeWaterfall({
      ...BASE,
      fees: [{ basisAmount: 100_000_000, feeBps: 1000 }], // $10M in fees — exceeds gross income
    });
    expect(result.residual).toBeLessThan(0);
  });
});
