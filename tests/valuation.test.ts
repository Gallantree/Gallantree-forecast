import { describe, it, expect } from "vitest";
import { computeValuation, type FYGroup } from "../src/engine/valuation";
import { money } from "../src/utils/money";
import type { MonthlyValue } from "../src/engine/pnl";

// Build a 60-month series where every month has the same value.
function flatSeries(monthly: number, periodKeys: string[]): MonthlyValue[] {
  return periodKeys.map((pk) => ({ periodKey: pk, value: money(monthly) }));
}

function periodKeys(startYear: number, startMonth: number, count: number): string[] {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function groupsByFiscalYear(periodList: string[]): FYGroup[] {
  // FY is the calendar year of the second half of the period (Jul-Jun fiscal).
  const map = new Map<number, string[]>();
  for (const pk of periodList) {
    const [yStr, mStr] = pk.split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    const fy = m >= 7 ? y + 1 : y;
    if (!map.has(fy)) map.set(fy, []);
    map.get(fy)!.push(pk);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([fy, months]) => ({ fy, months }));
}

const HORIZON = periodKeys(2026, 7, 60); // Jul 2026 → Jun 2031
const GROUPS = groupsByFiscalYear(HORIZON);

describe("computeValuation — DCF", () => {
  it("PV of a flat $1m/month FCF stream at 10% WACC with 0% terminal growth", () => {
    // FCF/yr = $12m flat. PV over 1y: 12 / 1.10 = 10.909m. TV = 12/0.10 = 120m, PV = 109.09m. EV = 120m.
    const series = flatSeries(1_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { waccPct: 10, terminalGrowthPct: 0, netDebt: 0 },
    );
    // For 1y horizon: PV(FCF_1) = 12m / 1.10 = 10,909,090.91
    //                 TV = 12m × 1 / (0.10 − 0) = 120m at end of Y1
    //                 PV(TV) = 120m / 1.10 = 109,090,909.09
    //                 EV = 120,000,000
    expect(v.dcf[0].horizonYears).toBe(1);
    expect(v.dcf[0].enterpriseValue.toFixed(0)).toBe("120000000");
    expect(v.dcf[0].invalidReason).toBeUndefined();
  });

  it("flags invalid when WACC <= terminal growth", () => {
    const series = flatSeries(1_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { waccPct: 5, terminalGrowthPct: 5 },
    );
    expect(v.dcf[0].invalidReason).toBe("WACC must exceed terminal growth");
    expect(v.dcf[0].terminalValue.toFixed(0)).toBe("0");
  });

  it("subtracts net debt from EV to get equity value", () => {
    const series = flatSeries(1_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { waccPct: 10, terminalGrowthPct: 0, netDebt: 20_000_000 },
    );
    expect(v.dcf[0].equityValue.toFixed(0)).toBe("100000000");
  });

  it("longer horizon = strictly higher EV under positive FCF growth (or equal under flat)", () => {
    // Flat case: longer horizons converge but PV of TV decreases; EV stays the same in the limit.
    const series = flatSeries(1_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { waccPct: 10, terminalGrowthPct: 0 },
    );
    // All horizons should give same EV under flat perpetuity at WACC=10, g=0
    const ev1 = Number(v.dcf[0].enterpriseValue.toFixed(0));
    const ev5 = Number(v.dcf[4].enterpriseValue.toFixed(0));
    // Should be essentially equal (within rounding) since flat FCF perpetuity = FCF/WACC
    expect(Math.abs(ev1 - ev5)).toBeLessThan(2);
  });
});

describe("computeValuation — multiples", () => {
  it("EV/EBITDA = multiple × EBITDA", () => {
    const series = flatSeries(1_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { evEbitdaMultiple: 8, netDebt: 5_000_000 },
    );
    // FY EBITDA = 12m, EV = 96m, Equity = 91m
    expect(v.evEbitda[0].enterpriseValue.toFixed(0)).toBe("96000000");
    expect(v.evEbitda[0].equityValue.toFixed(0)).toBe("91000000");
  });

  it("EV/Revenue uses revenue total", () => {
    const series = flatSeries(2_000_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { evRevenueMultiple: 3 },
    );
    // Y1 revenue = 24m, EV = 72m
    expect(v.evRevenue[0].enterpriseValue.toFixed(0)).toBe("72000000");
  });

  it("P/E gives equity directly", () => {
    const series = flatSeries(500_000, HORIZON);
    const v = computeValuation(
      GROUPS,
      {
        revenueTotals: series,
        ebitda: series,
        ebit: series,
        netIncome: series,
        netCashMovement: series,
      },
      { peMultiple: 15 },
    );
    // Y1 NI = 6m, equity = 90m
    expect(v.pe[0].equityValue.toFixed(0)).toBe("90000000");
  });
});
