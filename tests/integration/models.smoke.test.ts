// Smoke test for the memory-Mongo lifecycle helper.
//
// Confirms that:
//   1. useMemoryMongo() spins up a real mongod and lets Mongoose connect
//   2. Models can read/write Decimal128 + nested sub-docs round-trip
//   3. Collections are cleared between tests so suites don't pollute each
//      other's state
//
// If any of these fail, every downstream integration test will too — keep
// this one cheap and dependency-free.

import { describe, expect, it } from "vitest";
import { CapitalProgram, Loan, Scenario } from "@/models";
import { useMemoryMongo } from "../helpers/db";
import { makeLoan, makeProgram, makeScenario } from "../helpers/factories";

describe("memory-mongo smoke", () => {
  useMemoryMongo();

  it("persists a scenario + capital program + loan in one chain", async () => {
    const scenario = await makeScenario();
    const program = await makeProgram(scenario._id);
    const loan = await makeLoan(scenario._id, program._id);

    expect(scenario._id).toBeDefined();
    expect(program.scenarioId.toString()).toBe(scenario._id.toString());
    expect(loan.capitalProgramId?.toString()).toBe(program._id.toString());

    // Decimal128 round-trips cleanly via .toString()
    // Decimal128 stringifies with trailing-zero precision (e.g. "5000000.00")
    // — compare numerically rather than string-equal.
    expect(Number(loan.balance.toString())).toBe(5_000_000);

    // Sub-doc array intact
    expect(program.fees).toHaveLength(1);
    expect(program.fees[0].feeBps).toBe(50);
    expect(program.liabilities).toHaveLength(1);
    expect(program.liabilities?.[0].numNotes).toBe(70_000);
  });

  it("starts each test with empty collections", async () => {
    const [scenarios, programs, loans] = await Promise.all([
      Scenario.countDocuments({}),
      CapitalProgram.countDocuments({}),
      Loan.countDocuments({}),
    ]);
    expect(scenarios).toBe(0);
    expect(programs).toBe(0);
    expect(loans).toBe(0);
  });
});
