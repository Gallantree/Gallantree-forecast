// End-to-end test for the Capital Programs server actions.
//
// Boots a memory-Mongo, mocks `next/cache`'s revalidatePath, then drives the
// actions module exactly like a server-rendered form submission would.
// Verifies persistence + cache-invalidation in one pass.

import { beforeEach, describe, expect, it, vi } from "vitest";

// IMPORTANT: vi.mock() is hoisted above imports, so this must run BEFORE we
// import the action module. Otherwise Next's edge stubs would try to wire
// the real revalidatePath which throws outside a Next server.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

import { revalidatePath } from "next/cache";
import { CapitalProgram } from "@/models";
import {
  cloneProgram,
  createProgram,
  deleteProgram,
  updateProgram,
  type ProgramPayload,
} from "@/app/scenarios/[id]/_actions";
import { useMemoryMongo } from "../helpers/db";
import { makeProgram, makeScenario } from "../helpers/factories";

const basePayload = (over: Partial<ProgramPayload> = {}): ProgramPayload => ({
  name: "Action-created CRE CLO",
  type: "CRE_CLO",
  dealSize: "150000000",
  faceValuePerNote: "1000",
  startPeriodKey: "2026-07",
  endPeriodKey: "2031-06",
  // Non-empty notes: updateProgram has a $set/$unset conflict when
  // payload.notes is "" — see scenarios/[id]/_actions.ts. Pass a value so
  // these tests focus on happy-path persistence rather than that latent bug.
  notes: "auto-test",
  fees: [
    {
      name: "Senior management",
      category: "senior_mgmt",
      basisAmount: "150000000",
      feeBps: 50,
      accountCode: "4100",
    },
  ],
  liabilities: [
    {
      name: "A",
      numNotes: 105_000,
      returnProfileBps: 150,
      calculationMethod: "monthly",
      rateType: "variable",
      accountCode: "2100",
    },
  ],
  ...over,
});

describe("scenarios/[id] program actions", () => {
  useMemoryMongo();

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  it("createProgram persists a valid payload and revalidates the scenario page", async () => {
    const scenario = await makeScenario();
    await createProgram(scenario._id.toString(), basePayload());

    const found = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(found).not.toBeNull();
    expect(found?.name).toBe("Action-created CRE CLO");
    expect(Number(found?.dealSize?.toString())).toBe(150_000_000);
    expect(found?.fees).toHaveLength(1);
    expect(found?.liabilities?.[0].numNotes).toBe(105_000);

    expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
  });

  it("createProgram silently no-ops on an invalid scenarioId", async () => {
    await createProgram("not-an-objectid", basePayload());
    expect(await CapitalProgram.countDocuments({})).toBe(0);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("createProgram drops malformed fees but still persists the program", async () => {
    const scenario = await makeScenario();
    await createProgram(
      scenario._id.toString(),
      basePayload({
        fees: [
          // Valid
          {
            name: "Senior management",
            category: "senior_mgmt",
            basisAmount: "150000000",
            feeBps: 50,
            accountCode: "4100",
          },
          // Invalid — empty name
          {
            name: "",
            category: "servicing",
            basisAmount: "1000000",
            feeBps: 25,
            accountCode: "4200",
          },
          // Invalid — negative bps (rejected by `feeBps >= 0`)
          {
            name: "Other",
            category: "other",
            basisAmount: "1000000",
            feeBps: -10,
            accountCode: "4300",
          },
        ],
      }),
    );

    const found = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(found?.fees).toHaveLength(1);
    expect(found?.fees[0].name).toBe("Senior management");
  });

  it("updateProgram rewrites the doc and revalidates", async () => {
    const scenario = await makeScenario();
    const program = await makeProgram(scenario._id);

    await updateProgram(
      scenario._id.toString(),
      program._id.toString(),
      basePayload({ name: "Updated", dealSize: "200000000" }),
    );

    const found = await CapitalProgram.findById(program._id);
    expect(found?.name).toBe("Updated");
    expect(Number(found?.dealSize?.toString())).toBe(200_000_000);
    expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
  });

  it("deleteProgram removes only the targeted program", async () => {
    const scenario = await makeScenario();
    const a = await makeProgram(scenario._id, { name: "A" });
    const b = await makeProgram(scenario._id, { name: "B" });

    await deleteProgram(scenario._id.toString(), a._id.toString());

    const remaining = await CapitalProgram.find({ scenarioId: scenario._id });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]._id.toString()).toBe(b._id.toString());
  });

  it("createProgram persists rampUpMonths + amortisationMonths when provided", async () => {
    const scenario = await makeScenario();
    await createProgram(
      scenario._id.toString(),
      basePayload({ rampUpMonths: 3, amortisationMonths: 12 }),
    );
    const found = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(found?.rampUpMonths).toBe(3);
    expect(found?.amortisationMonths).toBe(12);
  });

  it("createProgram coerces non-positive ramp/amort to undefined", async () => {
    const scenario = await makeScenario();
    await createProgram(
      scenario._id.toString(),
      basePayload({ rampUpMonths: 0, amortisationMonths: -5 }),
    );
    const found = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(found?.rampUpMonths).toBeUndefined();
    expect(found?.amortisationMonths).toBeUndefined();
  });

  it("updateProgram unsets ramp/amort when cleared, persists when set", async () => {
    const scenario = await makeScenario();
    await createProgram(
      scenario._id.toString(),
      basePayload({ rampUpMonths: 6, amortisationMonths: 24 }),
    );
    const created = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(created?.rampUpMonths).toBe(6);

    // Clear by passing undefined (form left blank).
    await updateProgram(
      scenario._id.toString(),
      created!._id.toString(),
      basePayload({ rampUpMonths: undefined, amortisationMonths: undefined }),
    );
    const cleared = await CapitalProgram.findOne({ _id: created!._id });
    expect(cleared?.rampUpMonths).toBeUndefined();
    expect(cleared?.amortisationMonths).toBeUndefined();

    // Re-set to new values.
    await updateProgram(
      scenario._id.toString(),
      created!._id.toString(),
      basePayload({ rampUpMonths: 2, amortisationMonths: 18 }),
    );
    const reset = await CapitalProgram.findOne({ _id: created!._id });
    expect(reset?.rampUpMonths).toBe(2);
    expect(reset?.amortisationMonths).toBe(18);
  });

  it("createProgram persists upfrontFees and sanitises malformed rows", async () => {
    const scenario = await makeScenario();
    await createProgram(
      scenario._id.toString(),
      basePayload({
        upfrontFees: [
          {
            name: "Legal counsel",
            category: "legal",
            amount: "900000",
            accountCode: "6900",
          },
          // Invalid: empty name
          { name: "", category: "other", amount: "100", accountCode: "6900" },
          // Invalid: bad amount
          {
            name: "Bad amount",
            category: "underwriter",
            amount: "not-a-number",
            accountCode: "6900",
          },
        ],
      }),
    );
    const found = await CapitalProgram.findOne({ scenarioId: scenario._id });
    expect(found?.upfrontFees).toHaveLength(1);
    expect(found?.upfrontFees?.[0].name).toBe("Legal counsel");
    expect(Number(found?.upfrontFees?.[0].amount.toString())).toBe(900_000);
  });

  it("cloneProgram duplicates fees + liabilities and tags name with (copy)", async () => {
    const scenario = await makeScenario();
    const original = await makeProgram(scenario._id, { name: "FL-1" });

    await cloneProgram(scenario._id.toString(), original._id.toString());

    const all = await CapitalProgram.find({ scenarioId: scenario._id }).sort({ createdAt: 1 });
    expect(all).toHaveLength(2);
    expect(all[1].name).toBe("FL-1 (copy)");
    expect(all[1].fees).toHaveLength(original.fees.length);
    expect(all[1].liabilities).toHaveLength(original.liabilities?.length ?? 0);
    // Crucially, the clone should NOT share _id with the source.
    expect(all[1]._id.toString()).not.toBe(original._id.toString());
  });
});
