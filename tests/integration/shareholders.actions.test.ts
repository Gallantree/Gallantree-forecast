// Integration tests for the shareholder server actions.
//
// Boots a memory-Mongo, mocks Next/auth stubs, then drives createShareholder,
// updateShareholder, deleteShareholder, and seedShareholders exactly as a
// server-rendered form submission would. Asserts DB state + cache invalidation.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));
vi.mock("@/lib/currentUser", () => ({
  getCurrentUser: vi.fn().mockResolvedValue({
    id: "000000000000000000000001",
    email: "test@example.com",
    userType: "superadmin",
    status: "active",
  }),
}));
vi.mock("@/lib/assertScenarioAccess", () => ({
  assertScenarioAccess: vi.fn().mockResolvedValue({ ok: true, scenario: {} }),
}));

import { revalidatePath } from "next/cache";
import { Shareholder } from "@/models";
import {
  createShareholder,
  deleteShareholder,
  seedShareholders,
  updateShareholder,
  type ShareholderPayload,
} from "@/app/scenarios/[id]/_actions";
import { useMemoryMongo } from "../helpers/db";
import { makeShareholder, makeScenario } from "../helpers/factories";

const SHAREHOLDER_SEED_COUNT = 27;

function payload(over: Partial<ShareholderPayload> = {}): ShareholderPayload {
  return {
    name: "Test Holder",
    entityTrust: "Test Holder ATF Test Trust",
    shareClass: "Ordinary",
    shares: "10000",
    pricePerShare: "0.5",
    beneficiallyHeld: false,
    dateOfIssue: "2026-03-24",
    ...over,
  };
}

describe("shareholders actions", () => {
  useMemoryMongo();

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  // ── createShareholder ────────────────────────────────────────────────────

  describe("createShareholder", () => {
    it("persists a valid payload and revalidates the scenario page", async () => {
      const scenario = await makeScenario();
      const sid = scenario._id.toString();

      await createShareholder(sid, payload());

      const doc = await Shareholder.findOne({ scenarioId: scenario._id });
      expect(doc).not.toBeNull();
      expect(doc?.name).toBe("Test Holder");
      expect(doc?.shareClass).toBe("Ordinary");
      expect(doc?.shares).toBe(10_000);
      expect(Number(doc?.pricePerShare?.toString())).toBe(0.5);
      expect(doc?.beneficiallyHeld).toBe(false);
      expect(doc?.entityTrust).toBe("Test Holder ATF Test Trust");
      expect(revalidatePath).toHaveBeenCalledOnce();
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${sid}`);
    });

    it("stores pricePerShare as Decimal128 with correct precision", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ pricePerShare: "0.001" }));

      const doc = await Shareholder.findOne({ scenarioId: scenario._id });
      expect(Number(doc?.pricePerShare?.toString())).toBeCloseTo(0.001, 5);
    });

    it("trims whitespace from name and entityTrust", async () => {
      const scenario = await makeScenario();
      await createShareholder(
        scenario._id.toString(),
        payload({ name: "  Padded Name  ", entityTrust: "  Padded Trust  " }),
      );
      const doc = await Shareholder.findOne({ scenarioId: scenario._id });
      expect(doc?.name).toBe("Padded Name");
      expect(doc?.entityTrust).toBe("Padded Trust");
    });

    it("stores a beneficiallyHeld=true record correctly", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ beneficiallyHeld: true, entityTrust: undefined }));
      const doc = await Shareholder.findOne({ scenarioId: scenario._id });
      expect(doc?.beneficiallyHeld).toBe(true);
    });

    it("silently no-ops on an invalid scenarioId", async () => {
      await createShareholder("not-an-objectid", payload());
      expect(await Shareholder.countDocuments()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("silently no-ops when dateOfIssue is not YYYY-MM-DD", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ dateOfIssue: "24 Mar 2026" }));
      expect(await Shareholder.countDocuments()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("silently no-ops when shares is less than 1", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ shares: "0" }));
      expect(await Shareholder.countDocuments()).toBe(0);
    });

    it("silently no-ops when shares is not a finite number", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ shares: "abc" }));
      expect(await Shareholder.countDocuments()).toBe(0);
    });

    it("silently no-ops when name is blank", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ name: "   " }));
      expect(await Shareholder.countDocuments()).toBe(0);
    });

    it("floors fractional share counts to integers", async () => {
      const scenario = await makeScenario();
      await createShareholder(scenario._id.toString(), payload({ shares: "10000.9" }));
      const doc = await Shareholder.findOne({ scenarioId: scenario._id });
      expect(doc?.shares).toBe(10_000);
    });
  });

  // ── updateShareholder ────────────────────────────────────────────────────

  describe("updateShareholder", () => {
    it("updates all fields and revalidates", async () => {
      const scenario = await makeScenario();
      const holder = await makeShareholder(scenario._id);
      const sid = scenario._id.toString();

      await updateShareholder(sid, holder._id.toString(), payload({
        name: "Updated Name",
        shareClass: "Preference",
        shares: "500000",
        pricePerShare: "4.00",
        beneficiallyHeld: true,
        dateOfIssue: "2026-04-01",
      }));

      const doc = await Shareholder.findById(holder._id);
      expect(doc?.name).toBe("Updated Name");
      expect(doc?.shareClass).toBe("Preference");
      expect(doc?.shares).toBe(500_000);
      expect(Number(doc?.pricePerShare?.toString())).toBe(4.0);
      expect(doc?.beneficiallyHeld).toBe(true);
      expect(doc?.dateOfIssue.toISOString().startsWith("2026-04-01")).toBe(true);
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${sid}`);
    });

    it("no-ops when the shareholderId does not belong to the scenario", async () => {
      const s1 = await makeScenario();
      const s2 = await makeScenario();
      const holder = await makeShareholder(s1._id);

      // Attempt to update using s2's scenarioId — the filter won't match
      await updateShareholder(s2._id.toString(), holder._id.toString(), payload({ name: "Hijacked" }));

      const doc = await Shareholder.findById(holder._id);
      expect(doc?.name).toBe("Test Holder"); // unchanged
    });

    it("no-ops on an invalid shareholderId format", async () => {
      const scenario = await makeScenario();
      await updateShareholder(scenario._id.toString(), "bad-id", payload());
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("no-ops on an invalid date format", async () => {
      const scenario = await makeScenario();
      const holder = await makeShareholder(scenario._id);
      await updateShareholder(
        scenario._id.toString(),
        holder._id.toString(),
        payload({ dateOfIssue: "not-a-date" }),
      );
      const doc = await Shareholder.findById(holder._id);
      expect(doc?.name).toBe("Test Holder"); // unchanged
    });
  });

  // ── deleteShareholder ────────────────────────────────────────────────────

  describe("deleteShareholder", () => {
    it("removes the shareholder document and revalidates", async () => {
      const scenario = await makeScenario();
      const holder = await makeShareholder(scenario._id);
      expect(await Shareholder.countDocuments()).toBe(1);

      await deleteShareholder(scenario._id.toString(), holder._id.toString());

      expect(await Shareholder.countDocuments()).toBe(0);
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
    });

    it("does not delete a document belonging to a different scenario", async () => {
      const s1 = await makeScenario();
      const s2 = await makeScenario();
      const holder = await makeShareholder(s1._id);

      await deleteShareholder(s2._id.toString(), holder._id.toString());

      expect(await Shareholder.countDocuments()).toBe(1); // still exists
    });

    it("no-ops on an invalid scenarioId", async () => {
      const scenario = await makeScenario();
      await makeShareholder(scenario._id);
      await deleteShareholder("bad-id", "000000000000000000000001");
      expect(await Shareholder.countDocuments()).toBe(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("no-ops gracefully when the document does not exist", async () => {
      const scenario = await makeScenario();
      await deleteShareholder(scenario._id.toString(), "000000000000000000000001");
      // Should not throw, should still revalidate (action doesn't check for existence)
    });
  });

  // ── seedShareholders ─────────────────────────────────────────────────────

  describe("seedShareholders", () => {
    it(`inserts all ${SHAREHOLDER_SEED_COUNT} seed records in a single call`, async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());
      expect(await Shareholder.countDocuments({ scenarioId: scenario._id })).toBe(SHAREHOLDER_SEED_COUNT);
    });

    it(`returns { inserted: ${SHAREHOLDER_SEED_COUNT} }`, async () => {
      const scenario = await makeScenario();
      const result = await seedShareholders(scenario._id.toString());
      expect(result.inserted).toBe(SHAREHOLDER_SEED_COUNT);
    });

    it("revalidates the scenario page exactly once", async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());
      expect(revalidatePath).toHaveBeenCalledOnce();
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
    });

    it("seeds are scenario-scoped — two scenarios get independent copies", async () => {
      const s1 = await makeScenario();
      const s2 = await makeScenario();
      await seedShareholders(s1._id.toString());
      await seedShareholders(s2._id.toString());

      expect(await Shareholder.countDocuments({ scenarioId: s1._id })).toBe(SHAREHOLDER_SEED_COUNT);
      expect(await Shareholder.countDocuments({ scenarioId: s2._id })).toBe(SHAREHOLDER_SEED_COUNT);
      expect(await Shareholder.countDocuments()).toBe(SHAREHOLDER_SEED_COUNT * 2);
    });

    it("calling seed twice appends — does not deduplicate", async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());
      await seedShareholders(scenario._id.toString());
      expect(await Shareholder.countDocuments({ scenarioId: scenario._id })).toBe(SHAREHOLDER_SEED_COUNT * 2);
    });

    it("silently no-ops and returns { inserted: 0 } on an invalid scenarioId", async () => {
      const result = await seedShareholders("not-an-objectid");
      expect(result).toEqual({ inserted: 0 });
      expect(await Shareholder.countDocuments()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("persists all share class variants present in the register", async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());

      const classes = await Shareholder.distinct("shareClass", { scenarioId: scenario._id });
      expect(classes.sort()).toEqual(["Founder Shares", "Ordinary", "Preference"]);
    });

    it("Brett Hales is seeded with Founder Shares at $0.001", async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());

      const brett = await Shareholder.findOne({
        scenarioId: scenario._id,
        name: "Brett Anthony Hales",
      });
      expect(brett).not.toBeNull();
      expect(brett?.shareClass).toBe("Founder Shares");
      expect(Number(brett?.pricePerShare?.toString())).toBeCloseTo(0.001, 5);
      expect(brett?.shares).toBe(3_960_504);
      expect(brett?.beneficiallyHeld).toBe(false);
    });

    it("total seeded shares sum to 15,179,263", async () => {
      const scenario = await makeScenario();
      await seedShareholders(scenario._id.toString());

      const docs = await Shareholder.find({ scenarioId: scenario._id }).lean();
      const total = docs.reduce((s, d) => s + d.shares, 0);
      expect(total).toBe(15_179_263);
    });
  });
});
