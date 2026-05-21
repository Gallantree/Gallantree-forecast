import { describe, expect, it } from "vitest";
import {
  type ComplianceLicenseInput,
  projectLicenseBillings,
  projectPlatformLicense,
} from "../src/engine/platformLicenses";

function buildHorizon(start: string, count: number): string[] {
  const [y, m] = start.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const total = (y - 1) * 12 + (m - 1) + i;
    const yr = Math.floor(total / 12) + 1;
    const mo = (total % 12) + 1;
    out.push(`${yr}-${String(mo).padStart(2, "0")}`);
  }
  return out;
}

const baseAnnual: ComplianceLicenseInput = {
  id: "lic-1",
  name: "Compliance — annual billed",
  type: "compliance",
  startPeriodKey: "2026-01",
  monthlyFeePerSeat: 100,
  seatCount: 10,
  billingFrequency: "annual",
};

describe("projectLicenseBillings — annual cadence", () => {
  it("bills only on anniversary months within the horizon", () => {
    const horizon = buildHorizon("2026-01", 24);
    const billings = projectLicenseBillings(baseAnnual, horizon);
    const nonZero = billings.filter((b) => !b.value.eq(0));
    expect(nonZero.map((b) => b.periodKey)).toEqual(["2026-01", "2027-01"]);
    // Each anniversary lumps 12 months of recognised revenue (1000/mo × 12).
    expect(nonZero[0].value.toNumber()).toBe(12000);
    expect(nonZero[1].value.toNumber()).toBe(12000);
  });

  it("still bills on anniversaries when the license started BEFORE the horizon", () => {
    // License started 2024-06; horizon begins 2026-01 (license is 19 months old).
    // Anniversaries land on 2024-06, 2025-06, 2026-06, 2027-06 — within the horizon
    // 2026-06 and 2027-06 should each carry a year of lumped billing.
    const lic: ComplianceLicenseInput = { ...baseAnnual, startPeriodKey: "2024-06" };
    const horizon = buildHorizon("2026-01", 24);
    const billings = projectLicenseBillings(lic, horizon);
    const nonZero = billings.filter((b) => !b.value.eq(0));
    expect(nonZero.map((b) => b.periodKey)).toEqual(["2026-06", "2027-06"]);
    // First anniversary inside the horizon lumps a full 12 months.
    expect(nonZero[0].value.toNumber()).toBe(12000);
    // Second anniversary lands 7 months before the horizon ends (Jun–Dec 2027).
    expect(nonZero[1].value.toNumber()).toBe(7000);
  });

  it("monthly-billed licenses fall through to recognised values (no change in behaviour)", () => {
    const lic: ComplianceLicenseInput = { ...baseAnnual, billingFrequency: "monthly" };
    const horizon = buildHorizon("2026-01", 3);
    const billings = projectLicenseBillings(lic, horizon);
    const recognised = projectPlatformLicense(lic, horizon);
    expect(billings.map((b) => b.value.toNumber())).toEqual(
      recognised.map((b) => b.value.toNumber()),
    );
  });
});
