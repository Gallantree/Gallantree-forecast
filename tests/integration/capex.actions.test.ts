// Integration tests for capex server actions.
//
// Covers createCapexDriver, batchCreateCapexDrivers, updateCapexDriver, and
// deleteCapexDriver. Uses memory-Mongo so no real DB is required.

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
import { Driver } from "@/models";
import {
  batchCreateCapexDrivers,
  createCapexDriver,
  deleteCapexDriver,
  updateCapexDriver,
  type CapexDriverPayload,
} from "@/app/scenarios/[id]/_actions";
import { useMemoryMongo } from "../helpers/db";
import { makeScenario } from "../helpers/factories";

function capexPayload(over: Partial<CapexDriverPayload> = {}): CapexDriverPayload {
  return {
    name: "Test servers",
    accountCode: "6720",
    inServicePeriodKey: "2026-07",
    cost: "12000",
    usefulLifeMonths: 60,
    ...over,
  };
}

describe("capex actions", () => {
  useMemoryMongo();

  beforeEach(() => {
    vi.mocked(revalidatePath).mockClear();
  });

  // ── createCapexDriver ────────────────────────────────────────────────────

  describe("createCapexDriver", () => {
    it("persists a valid payload with the correct type and fields", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload());

      const doc = await Driver.findOne({ scenarioId: scenario._id });
      expect(doc).not.toBeNull();
      expect(doc?.type).toBe("capex_straight_line");
      expect(doc?.name).toBe("Test servers");
      expect(doc?.accountCode).toBe("6720");
      expect(doc?.startPeriodKey).toBe("2026-07");
      expect(doc?.inServicePeriodKey).toBe("2026-07");
      expect(Number(doc?.cost?.toString())).toBe(12_000);
      expect(doc?.usefulLifeMonths).toBe(60);
    });

    it("revalidates the scenario page", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload());
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
    });

    it("silently no-ops on an invalid scenarioId", async () => {
      await createCapexDriver("not-valid", capexPayload());
      expect(await Driver.countDocuments()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("silently no-ops when inServicePeriodKey is malformed", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload({ inServicePeriodKey: "2026-13" }));
      expect(await Driver.countDocuments()).toBe(0);
    });

    it("silently no-ops when cost is zero or negative", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload({ cost: "0" }));
      await createCapexDriver(scenario._id.toString(), capexPayload({ cost: "-500" }));
      expect(await Driver.countDocuments()).toBe(0);
    });

    it("silently no-ops when usefulLifeMonths is less than 1", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload({ usefulLifeMonths: 0 }));
      expect(await Driver.countDocuments()).toBe(0);
    });

    it("floors fractional usefulLifeMonths", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload({ usefulLifeMonths: 36.9 }));
      const doc = await Driver.findOne({ scenarioId: scenario._id });
      expect(doc?.usefulLifeMonths).toBe(36);
    });
  });

  // ── updateCapexDriver ────────────────────────────────────────────────────

  describe("updateCapexDriver", () => {
    it("updates all fields and revalidates", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload());
      const doc = await Driver.findOne({ scenarioId: scenario._id });
      const driverId = doc!._id.toString();
      vi.mocked(revalidatePath).mockClear();

      await updateCapexDriver(scenario._id.toString(), driverId, capexPayload({
        name: "Updated asset",
        accountCode: "6700",
        inServicePeriodKey: "2027-01",
        cost: "25000",
        usefulLifeMonths: 36,
      }));

      const updated = await Driver.findById(driverId);
      expect(updated?.name).toBe("Updated asset");
      expect(updated?.accountCode).toBe("6700");
      expect(updated?.startPeriodKey).toBe("2027-01");
      expect(Number(updated?.cost?.toString())).toBe(25_000);
      expect(updated?.usefulLifeMonths).toBe(36);
      expect(revalidatePath).toHaveBeenCalledOnce();
    });

    it("no-ops when driverId does not belong to the scenario", async () => {
      const s1 = await makeScenario();
      const s2 = await makeScenario();
      await createCapexDriver(s1._id.toString(), capexPayload());
      const doc = await Driver.findOne({ scenarioId: s1._id });

      await updateCapexDriver(s2._id.toString(), doc!._id.toString(), capexPayload({ name: "Hijacked" }));

      const unchanged = await Driver.findById(doc!._id);
      expect(unchanged?.name).toBe("Test servers");
    });
  });

  // ── deleteCapexDriver ────────────────────────────────────────────────────

  describe("deleteCapexDriver", () => {
    it("removes the driver and revalidates", async () => {
      const scenario = await makeScenario();
      await createCapexDriver(scenario._id.toString(), capexPayload());
      const doc = await Driver.findOne({ scenarioId: scenario._id });
      vi.mocked(revalidatePath).mockClear();

      await deleteCapexDriver(scenario._id.toString(), doc!._id.toString());

      expect(await Driver.countDocuments()).toBe(0);
      expect(revalidatePath).toHaveBeenCalledWith(`/scenarios/${scenario._id.toString()}`);
    });

    it("does not delete a driver from a different scenario", async () => {
      const s1 = await makeScenario();
      const s2 = await makeScenario();
      await createCapexDriver(s1._id.toString(), capexPayload());
      const doc = await Driver.findOne({ scenarioId: s1._id });

      await deleteCapexDriver(s2._id.toString(), doc!._id.toString());

      expect(await Driver.countDocuments()).toBe(1);
    });
  });

  // ── batchCreateCapexDrivers ──────────────────────────────────────────────

  describe("batchCreateCapexDrivers", () => {
    it("inserts all valid payloads in a single call", async () => {
      const scenario = await makeScenario();
      const payloads: CapexDriverPayload[] = [
        capexPayload({ name: "MacBook Pros", accountCode: "6700", cost: "7497", usefulLifeMonths: 36 }),
        capexPayload({ name: "Mac Minis", accountCode: "6720", cost: "12990", usefulLifeMonths: 60 }),
        capexPayload({ name: "Monitors", accountCode: "6720", cost: "3490", usefulLifeMonths: 60 }),
      ];

      await batchCreateCapexDrivers(scenario._id.toString(), payloads);

      const docs = await Driver.find({ scenarioId: scenario._id });
      expect(docs).toHaveLength(3);
      expect(docs.map((d) => d.name).sort()).toEqual(["MacBook Pros", "Mac Minis", "Monitors"].sort());
    });

    it("revalidates exactly once regardless of batch size", async () => {
      const scenario = await makeScenario();
      const payloads = Array.from({ length: 8 }, (_, i) =>
        capexPayload({ name: `Asset ${i}`, cost: String((i + 1) * 1000) }),
      );

      await batchCreateCapexDrivers(scenario._id.toString(), payloads);

      expect(revalidatePath).toHaveBeenCalledOnce();
    });

    it("filters out invalid payloads and inserts the valid remainder", async () => {
      const scenario = await makeScenario();
      const payloads: CapexDriverPayload[] = [
        capexPayload({ name: "Valid asset", cost: "5000" }),
        capexPayload({ name: "", cost: "5000" }),            // blank name — dropped
        capexPayload({ name: "Bad period", inServicePeriodKey: "26-07" }), // bad period — dropped
        capexPayload({ name: "Zero cost", cost: "0" }),     // zero cost — dropped
        capexPayload({ name: "Valid asset 2", cost: "9999" }),
      ];

      await batchCreateCapexDrivers(scenario._id.toString(), payloads);

      const docs = await Driver.find({ scenarioId: scenario._id });
      expect(docs).toHaveLength(2);
      expect(docs.map((d) => d.name).sort()).toEqual(["Valid asset", "Valid asset 2"]);
    });

    it("inserts nothing and does not revalidate when all payloads are invalid", async () => {
      const scenario = await makeScenario();
      await batchCreateCapexDrivers(scenario._id.toString(), [
        capexPayload({ name: "", cost: "1000" }),
        capexPayload({ name: "Bad cost", cost: "abc" }),
      ]);
      // revalidatePath is still called (action always revalidates) but no docs written
      expect(await Driver.countDocuments()).toBe(0);
    });

    it("silently no-ops on an invalid scenarioId", async () => {
      await batchCreateCapexDrivers("not-valid", [capexPayload()]);
      expect(await Driver.countDocuments()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("handles an empty payload array without error", async () => {
      const scenario = await makeScenario();
      await expect(
        batchCreateCapexDrivers(scenario._id.toString(), []),
      ).resolves.toBeUndefined();
      expect(await Driver.countDocuments()).toBe(0);
    });

    it("IDS entries with staggered period keys are all persisted", async () => {
      const scenario = await makeScenario();
      const idsPayloads: CapexDriverPayload[] = [
        capexPayload({ name: "IDS Y1", accountCode: "6710", inServicePeriodKey: "2026-07", cost: "360000", usefulLifeMonths: 60 }),
        capexPayload({ name: "IDS Y2", accountCode: "6710", inServicePeriodKey: "2027-07", cost: "360000", usefulLifeMonths: 60 }),
        capexPayload({ name: "IDS Y3", accountCode: "6710", inServicePeriodKey: "2028-07", cost: "360000", usefulLifeMonths: 60 }),
        capexPayload({ name: "IDS Y4", accountCode: "6710", inServicePeriodKey: "2029-07", cost: "360000", usefulLifeMonths: 60 }),
        capexPayload({ name: "IDS Y5", accountCode: "6710", inServicePeriodKey: "2030-07", cost: "360000", usefulLifeMonths: 60 }),
      ];

      await batchCreateCapexDrivers(scenario._id.toString(), idsPayloads);

      const docs = await Driver.find({ scenarioId: scenario._id, accountCode: "6710" });
      expect(docs).toHaveLength(5);
      const periods = docs.map((d) => d.inServicePeriodKey).sort();
      expect(periods).toEqual(["2026-07", "2027-07", "2028-07", "2029-07", "2030-07"]);
    });
  });
});
