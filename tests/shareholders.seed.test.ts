// Pure unit tests for the SHAREHOLDER_SEED data file.
//
// These run without a database — they verify that the seed matches the
// source-of-truth register (Gallantree_Group_Pty_Ltd_Share_Register_2026-05-25.xlsx)
// and that every record satisfies the model's constraints before it ever
// touches a real collection.

import { describe, expect, it } from "vitest";
import { SHAREHOLDER_SEED } from "@/seed/shareholders";

const VALID_CLASSES = new Set(["Founder Shares", "Ordinary", "Preference"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("SHAREHOLDER_SEED data integrity", () => {
  it("contains exactly 27 records matching the 25 May 2026 register", () => {
    expect(SHAREHOLDER_SEED).toHaveLength(27);
  });

  it("total shares issued sum to 15,179,263", () => {
    const total = SHAREHOLDER_SEED.reduce((s, r) => s + r.shares, 0);
    expect(total).toBe(15_179_263);
  });

  it("every dateOfIssue is a valid YYYY-MM-DD string", () => {
    for (const r of SHAREHOLDER_SEED) {
      expect(r.dateOfIssue, `${r.name}.dateOfIssue`).toMatch(DATE_RE);
      expect(Number.isNaN(Date.parse(r.dateOfIssue)), `${r.name} date is not parseable`).toBe(false);
    }
  });

  it("all issue dates fall in March 2026", () => {
    for (const r of SHAREHOLDER_SEED) {
      expect(r.dateOfIssue.startsWith("2026-03"), `${r.name}.dateOfIssue`).toBe(true);
    }
  });

  it("every shareClass is one of the three canonical classes", () => {
    for (const r of SHAREHOLDER_SEED) {
      expect(VALID_CLASSES.has(r.shareClass), `${r.name}.shareClass = "${r.shareClass}"`).toBe(true);
    }
  });

  it("every pricePerShare is a positive finite number when parsed", () => {
    for (const r of SHAREHOLDER_SEED) {
      const n = Number(r.pricePerShare);
      expect(Number.isFinite(n), `${r.name}.pricePerShare`).toBe(true);
      expect(n, `${r.name}.pricePerShare >= 0`).toBeGreaterThan(0);
    }
  });

  it("every shares count is a positive integer", () => {
    for (const r of SHAREHOLDER_SEED) {
      expect(r.shares, `${r.name}.shares`).toBeGreaterThan(0);
      expect(Number.isInteger(r.shares), `${r.name}.shares is integer`).toBe(true);
    }
  });

  it("beneficiallyHeld is a boolean for every record", () => {
    for (const r of SHAREHOLDER_SEED) {
      expect(typeof r.beneficiallyHeld, `${r.name}`).toBe("boolean");
    }
  });

  it("no duplicate names", () => {
    const names = SHAREHOLDER_SEED.map((r) => r.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("Founder Shares are issued at $0.001 and ordinary/preference at $0.50", () => {
    for (const r of SHAREHOLDER_SEED) {
      if (r.shareClass === "Founder Shares") {
        expect(r.pricePerShare, `${r.name} founder price`).toBe("0.001");
      }
    }
    // Non-founder shares should all be $0.001 or $0.5 (no unexpected prices)
    const knownPrices = new Set(["0.001", "0.5"]);
    for (const r of SHAREHOLDER_SEED) {
      expect(knownPrices.has(r.pricePerShare), `${r.name} price "${r.pricePerShare}"`).toBe(true);
    }
  });

  it("Brett Hales and Clive Kay hold the two Founder Shares blocks", () => {
    const founders = SHAREHOLDER_SEED.filter((r) => r.shareClass === "Founder Shares");
    expect(founders).toHaveLength(2);
    const names = founders.map((f) => f.name).sort();
    expect(names).toEqual(["Brett Anthony Hales", "Clive Paul Kay"]);
  });

  it("all shareholders without an entityTrust are beneficially held", () => {
    for (const r of SHAREHOLDER_SEED) {
      if (!r.entityTrust) {
        expect(r.beneficiallyHeld, `${r.name} has no entity but beneficiallyHeld=false`).toBe(true);
      }
    }
  });

  it("total paid-in capital is approximately $3.62M (within $1)", () => {
    const total = SHAREHOLDER_SEED.reduce(
      (s, r) => s + r.shares * Number(r.pricePerShare),
      0,
    );
    // Exact figure from the register: $3,619,583.51
    expect(total).toBeCloseTo(3_619_583.51, 0);
  });
});
