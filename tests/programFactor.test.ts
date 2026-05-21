import { describe, expect, it } from "vitest";
import {
  programBalanceFactor,
  programBalanceFactorSeries,
} from "../src/engine/programFactor";

function n(pk: string, p: Parameters<typeof programBalanceFactor>[1]): number {
  return Number(programBalanceFactor(pk, p).toFixed(6));
}

describe("programBalanceFactor", () => {
  it("returns 0 before startPeriodKey", () => {
    expect(n("2026-06", { startPeriodKey: "2026-07" })).toBe(0);
    expect(n("2025-01", { startPeriodKey: "2026-07" })).toBe(0);
  });

  it("returns 0 after endPeriodKey", () => {
    expect(n("2027-02", { startPeriodKey: "2026-07", endPeriodKey: "2027-01" })).toBe(0);
  });

  it("returns 1 inside an active deal with no ramp/amort", () => {
    expect(n("2026-07", { startPeriodKey: "2026-07" })).toBe(1);
    expect(n("2026-12", { startPeriodKey: "2026-07" })).toBe(1);
  });

  it("ramps linearly during ramp-up: (i+1)/N", () => {
    const p = { startPeriodKey: "2026-07", rampUpMonths: 3 };
    expect(n("2026-07", p)).toBeCloseTo(1 / 3, 6); // month 0
    expect(n("2026-08", p)).toBeCloseTo(2 / 3, 6); // month 1
    expect(n("2026-09", p)).toBeCloseTo(1, 6); // month 2 — fully drawn
    expect(n("2026-10", p)).toBe(1); // post-ramp
  });

  it("amortises linearly in the final N months: (N-i)/N", () => {
    // Active 2026-07 .. 2027-06 (12 months). amort=3 → indices 9, 10, 11.
    const p = {
      startPeriodKey: "2026-07",
      endPeriodKey: "2027-06",
      amortisationMonths: 3,
    };
    expect(n("2027-03", p)).toBe(1); // pre-amort
    expect(n("2027-04", p)).toBeCloseTo(3 / 3, 6); // amort idx 0 → 1.0
    expect(n("2027-05", p)).toBeCloseTo(2 / 3, 6); // amort idx 1
    expect(n("2027-06", p)).toBeCloseTo(1 / 3, 6); // amort idx 2 — final active
    expect(n("2027-07", p)).toBe(0); // past end
  });

  it("when ramp and amort overlap on a short deal, takes the smaller factor", () => {
    // 3-month deal with ramp=3 and amort=3: every month is in both windows.
    // Month 0: ramp=1/3, amort=3/3=1.0 → 1/3
    // Month 1: ramp=2/3, amort=2/3 → 2/3
    // Month 2: ramp=3/3=1.0, amort=1/3 → 1/3
    const p = {
      startPeriodKey: "2026-07",
      endPeriodKey: "2026-09",
      rampUpMonths: 3,
      amortisationMonths: 3,
    };
    expect(n("2026-07", p)).toBeCloseTo(1 / 3, 6);
    expect(n("2026-08", p)).toBeCloseTo(2 / 3, 6);
    expect(n("2026-09", p)).toBeCloseTo(1 / 3, 6);
  });

  it("ignores rampUpMonths === 0 or undefined (factor = 1 from day 1)", () => {
    expect(n("2026-07", { startPeriodKey: "2026-07", rampUpMonths: 0 })).toBe(1);
    expect(n("2026-07", { startPeriodKey: "2026-07" })).toBe(1);
  });

  it("ignores amortisationMonths when endPeriodKey is missing", () => {
    expect(
      n("2030-01", { startPeriodKey: "2026-07", amortisationMonths: 12 }),
    ).toBe(1);
  });

  it("programBalanceFactorSeries produces one entry per horizon period", () => {
    const horizon = ["2026-07", "2026-08", "2026-09"];
    const series = programBalanceFactorSeries(horizon, {
      startPeriodKey: "2026-07",
      rampUpMonths: 3,
    });
    expect(series.length).toBe(3);
    expect(series[0].periodKey).toBe("2026-07");
    expect(Number(series[0].value.toFixed(6))).toBeCloseTo(1 / 3, 6);
    expect(Number(series[2].value.toFixed(6))).toBeCloseTo(1, 6);
  });
});
