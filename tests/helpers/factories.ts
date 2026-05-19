// Tiny factory helpers for integration tests. Build minimal but valid
// documents directly via Mongoose models (faster + closer to wire format
// than going through server actions).
//
// Override anything via the `overrides` arg — fields you don't supply use a
// deterministic default so failed assertions point at the field under test.

import { Types } from "mongoose";
import { CapitalProgram, Loan, Scenario } from "@/models";
import { toDecimal128 } from "@/utils/money";

type AnyDoc = Record<string, unknown>;

export async function makeScenario(overrides: AnyDoc = {}) {
  return await Scenario.create({
    name: "Test scenario",
    status: "active",
    baseRateType: "BBSW",
    baseRateBps: 420,
    firstYearLabel: 2026,
    taxRatePct: toDecimal128("0.3"),
    ...overrides,
  });
}

export async function makeProgram(
  scenarioId: Types.ObjectId,
  overrides: AnyDoc = {},
) {
  return await CapitalProgram.create({
    scenarioId,
    name: "Test CRE CLO",
    type: "CRE_CLO",
    dealSize: toDecimal128("100000000"),
    faceValuePerNote: toDecimal128("1000"),
    startPeriodKey: "2026-07",
    endPeriodKey: "2031-06",
    fees: [
      {
        name: "Senior management",
        category: "senior_mgmt",
        basisAmount: toDecimal128("100000000"),
        feeBps: 50,
        accountCode: "4100",
      },
    ],
    liabilities: [
      {
        name: "A",
        numNotes: 70_000,
        returnProfileBps: 150,
        calculationMethod: "monthly",
        rateType: "variable",
        accountCode: "2100",
      },
    ],
    ...overrides,
  });
}

let loanCounter = 0;
function nextLoanId(): string {
  loanCounter += 1;
  return `L-${String(loanCounter).padStart(6, "0")}`;
}

export async function makeLoan(
  scenarioId: Types.ObjectId,
  capitalProgramId: Types.ObjectId,
  overrides: AnyDoc = {},
) {
  return await Loan.create({
    scenarioId,
    capitalProgramId,
    loanId: nextLoanId(),
    termMonths: 36,
    borrower: "Acme CRE",
    state: "NSW",
    assetClass: "Office",
    internalGrade: "B+",
    balance: toDecimal128("5000000"),
    creditSpreadBps: 350,
    lvr: toDecimal128("0.6"),
    dscr: toDecimal128("1.3"),
    originationDate: new Date("2026-01-15"),
    maturityDate: new Date("2029-01-15"),
    includeInRevenue: true,
    ...overrides,
  });
}
