"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/auditLog";
import { getCurrentUser } from "@/lib/currentUser";
import { connectToDatabase } from "@/lib/db";
import {
  CapitalProgram,
  CapitalRaise,
  Driver,
  Headcount,
  Loan,
  PlatformLicense,
  Scenario,
} from "@/models";
import type { ScenarioViewMode } from "@/models/scenario.model";

// Best-effort: the legacy unique index `isBase_1` predates the per-viewMode
// uniqueness scheme. If it's still present on the collection it will block
// the second base scenario. Drop it the first time we touch base state.
let legacyBaseIndexCleared = false;
async function dropLegacyBaseIndex(): Promise<void> {
  if (legacyBaseIndexCleared) return;
  try {
    await Scenario.collection.dropIndex("isBase_1");
  } catch {
    // Index does not exist (already cleaned up, or never created on this env).
  }
  legacyBaseIndexCleared = true;
}

export async function createScenario(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const me = await getCurrentUser();
  await connectToDatabase();
  const s = await Scenario.create({
    name,
    ...(me?.id && Types.ObjectId.isValid(me.id) ? { createdBy: new Types.ObjectId(me.id) } : {}),
    ...(me?.organisationId && Types.ObjectId.isValid(me.organisationId)
      ? { organisationId: new Types.ObjectId(me.organisationId) }
      : {}),
  });
  await writeAudit({
    userId: me?.id,
    userEmail: me?.email,
    action: "create",
    modelName: "Scenario",
    documentId: s._id.toString(),
    after: { name },
  });
  revalidatePath("/");
  redirect(`/scenarios/${s._id.toString()}`);
}

export async function setBaseScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  await dropLegacyBaseIndex();
  const s = await Scenario.findOne({ _id: scenarioId, deletedAt: null })
    .select("_id viewMode")
    .lean<{ viewMode?: ScenarioViewMode }>();
  if (!s) return;
  const mode: ScenarioViewMode = s.viewMode ?? "all";
  // Only clear bases that share the same viewMode — the other profile keeps
  // its own base independently.
  await Scenario.updateMany({ isBase: true, viewMode: mode }, { $set: { isBase: false } });
  if (mode === "all") {
    // Cover the legacy rows that pre-date the viewMode field — they implicitly
    // belonged to the 'all' profile.
    await Scenario.updateMany(
      { isBase: true, viewMode: { $exists: false } },
      { $set: { isBase: false, viewMode: "all" } },
    );
  }
  await Scenario.updateOne({ _id: scenarioId }, { $set: { isBase: true } });
  revalidatePath("/");
}

export async function unsetBaseScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  await Scenario.updateOne({ _id: scenarioId, deletedAt: null }, { $set: { isBase: false } });
  revalidatePath("/");
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const me = await getCurrentUser();
  await connectToDatabase();
  const s = await Scenario.findById(scenarioId).select("isBase name").lean<{
    isBase?: boolean;
    name: string;
  }>();
  if (!s) return;
  if (s.isBase) return; // refuse to delete the base scenario
  // Soft-delete: stamp deletedAt so data is recoverable.
  await Scenario.updateOne({ _id: scenarioId }, { $set: { deletedAt: new Date() } });
  await writeAudit({
    userId: me?.id,
    userEmail: me?.email,
    action: "delete",
    modelName: "Scenario",
    documentId: scenarioId,
    before: { name: s.name },
  });
  revalidatePath("/");
}

/**
 * Branch from base: creates a new scenario with parentId = base._id and
 * deep-clones drivers, headcount, loans, and capital programs. Base scenario
 * remains untouched.
 */
export async function branchFromBase(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const rawMode = String(formData.get("viewMode") ?? "all");
  const viewMode: ScenarioViewMode = rawMode === "gallantree" ? "gallantree" : "all";
  await connectToDatabase();

  const me = await getCurrentUser();
  const base = await Scenario.findOne({
    isBase: true,
    deletedAt: null,
    $or: [{ viewMode }, ...(viewMode === "all" ? [{ viewMode: { $exists: false } }] : [])],
  });
  if (!base) return;
  const baseId = base._id as Types.ObjectId;

  // Copy scenario-level assumptions onto the branch so the child stands on its
  // own without back-referencing the base for computation inputs.
  const child = await Scenario.create({
    name,
    parentId: baseId,
    isBase: false,
    viewMode,
    status: "draft",
    dsoDays: base.dsoDays,
    dpoDays: base.dpoDays,
    taxRatePct: base.taxRatePct,
    openingCash: base.openingCash,
    openingEquity: base.openingEquity,
    defaultCpiPct: base.defaultCpiPct,
    defaultSuperPct: base.defaultSuperPct,
    organisationId: base.organisationId,
    ...(me?.id && Types.ObjectId.isValid(me.id) ? { createdBy: new Types.ObjectId(me.id) } : {}),
  });
  const childId = child._id as Types.ObjectId;

  const [drivers, headcount, loans, programs] = await Promise.all([
    Driver.find({ scenarioId: baseId }).lean(),
    Headcount.find({ scenarioId: baseId }).lean(),
    Loan.find({ scenarioId: baseId }).lean(),
    CapitalProgram.find({ scenarioId: baseId }).lean(),
  ]);

  type LeanDoc = Record<string, unknown> & {
    _id?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
  };
  const stripIds = <T extends LeanDoc>(d: T) => {
    const { _id, createdAt, updatedAt, ...rest } = d;
    void _id;
    void createdAt;
    void updatedAt;
    return { ...rest, scenarioId: childId };
  };
  // Capital programs have embedded fees with their own _ids — let Mongoose
  // regenerate those by stripping them.
  const stripProgramFees = (p: LeanDoc): LeanDoc => {
    const cleaned = stripIds(p);
    const fees = (p.fees as Array<Record<string, unknown>>) ?? [];
    cleaned.fees = fees.map(({ _id, ...rest }) => {
      void _id;
      return rest;
    });
    return cleaned;
  };

  await Promise.all([
    drivers.length
      ? Driver.insertMany(drivers.map((d) => stripIds(d as unknown as LeanDoc)))
      : Promise.resolve(),
    headcount.length
      ? Headcount.insertMany(headcount.map((h) => stripIds(h as unknown as LeanDoc)))
      : Promise.resolve(),
    loans.length
      ? Loan.insertMany(loans.map((l) => stripIds(l as unknown as LeanDoc)))
      : Promise.resolve(),
    programs.length
      ? CapitalProgram.insertMany(programs.map((p) => stripProgramFees(p as unknown as LeanDoc)))
      : Promise.resolve(),
  ]);

  revalidatePath("/");
  redirect(`/scenarios/${childId.toString()}`);
}

/**
 * Create the missing base scenario for the opposite profile by deep-cloning
 * an existing scenario. Used from the home page when the "Gallantree view"
 * base slot is empty (or vice versa). The new scenario is flagged isBase=true
 * within its own viewMode and pulls in drivers, headcount, loans, programs,
 * platform licenses, and capital raises so the second profile is immediately
 * usable.
 */
export async function duplicateScenarioAsProfile(formData: FormData): Promise<void> {
  const sourceId = String(formData.get("sourceId") ?? "");
  const rawMode = String(formData.get("viewMode") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!Types.ObjectId.isValid(sourceId)) return;
  if (rawMode !== "all" && rawMode !== "gallantree") return;
  if (!name) return;
  const viewMode: ScenarioViewMode = rawMode;

  await connectToDatabase();
  await dropLegacyBaseIndex();
  const me = await getCurrentUser();

  const source = await Scenario.findOne({ _id: sourceId, deletedAt: null });
  if (!source) return;
  const sourceObjId = source._id as Types.ObjectId;

  // Ensure no existing base in the target profile collides with the unique index.
  await Scenario.updateMany({ isBase: true, viewMode }, { $set: { isBase: false } });
  if (viewMode === "all") {
    await Scenario.updateMany(
      { isBase: true, viewMode: { $exists: false } },
      { $set: { isBase: false, viewMode: "all" } },
    );
  }

  const child = await Scenario.create({
    name,
    isBase: true,
    viewMode,
    status: "active",
    dsoDays: source.dsoDays,
    dpoDays: source.dpoDays,
    taxRatePct: source.taxRatePct,
    openingCash: source.openingCash,
    openingEquity: source.openingEquity,
    defaultCpiPct: source.defaultCpiPct,
    defaultSuperPct: source.defaultSuperPct,
    loanBookGrowthPctByYear: source.loanBookGrowthPctByYear,
    bookGrowthProfiles: source.bookGrowthProfiles,
    waccPct: source.waccPct,
    terminalGrowthPct: source.terminalGrowthPct,
    evEbitdaMultiple: source.evEbitdaMultiple,
    evRevenueMultiple: source.evRevenueMultiple,
    peMultiple: source.peMultiple,
    netDebt: source.netDebt,
    baseRateType: source.baseRateType,
    baseRateBps: source.baseRateBps,
    firstYearLabel: source.firstYearLabel,
    staffTargetByYear: source.staffTargetByYear,
    organisationId: source.organisationId,
    ...(me?.id && Types.ObjectId.isValid(me.id) ? { createdBy: new Types.ObjectId(me.id) } : {}),
  });
  const childId = child._id as Types.ObjectId;

  const [drivers, headcount, loans, programs, licenses, raises] = await Promise.all([
    Driver.find({ scenarioId: sourceObjId }).lean(),
    Headcount.find({ scenarioId: sourceObjId }).lean(),
    Loan.find({ scenarioId: sourceObjId }).lean(),
    CapitalProgram.find({ scenarioId: sourceObjId }).lean(),
    PlatformLicense.find({ scenarioId: sourceObjId }).lean(),
    CapitalRaise.find({ scenarioId: sourceObjId }).lean(),
  ]);

  type LeanDoc = Record<string, unknown> & {
    _id?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
  };
  const stripIds = <T extends LeanDoc>(d: T) => {
    const { _id, createdAt, updatedAt, ...rest } = d;
    void _id;
    void createdAt;
    void updatedAt;
    return { ...rest, scenarioId: childId };
  };
  const stripNestedIds = (d: LeanDoc, arrayKeys: string[]): LeanDoc => {
    const cleaned = stripIds(d);
    for (const key of arrayKeys) {
      const arr = (d[key] as Array<Record<string, unknown>>) ?? [];
      cleaned[key] = arr.map(({ _id, ...rest }) => {
        void _id;
        return rest;
      });
    }
    return cleaned;
  };

  await Promise.all([
    drivers.length
      ? Driver.insertMany(drivers.map((d) => stripIds(d as unknown as LeanDoc)))
      : Promise.resolve(),
    headcount.length
      ? Headcount.insertMany(headcount.map((h) => stripIds(h as unknown as LeanDoc)))
      : Promise.resolve(),
    loans.length
      ? Loan.insertMany(loans.map((l) => stripIds(l as unknown as LeanDoc)))
      : Promise.resolve(),
    programs.length
      ? CapitalProgram.insertMany(
          programs.map((p) =>
            stripNestedIds(p as unknown as LeanDoc, ["fees", "liabilities", "upfrontFees"]),
          ),
        )
      : Promise.resolve(),
    licenses.length
      ? PlatformLicense.insertMany(licenses.map((l) => stripIds(l as unknown as LeanDoc)))
      : Promise.resolve(),
    raises.length
      ? CapitalRaise.insertMany(
          raises.map((r) => stripNestedIds(r as unknown as LeanDoc, ["investors"])),
        )
      : Promise.resolve(),
  ]);

  await writeAudit({
    userId: me?.id,
    userEmail: me?.email,
    action: "create",
    modelName: "Scenario",
    documentId: childId.toString(),
    after: { name, viewMode, duplicatedFrom: sourceObjId.toString() },
  });

  revalidatePath("/");
  redirect(`/scenarios/${childId.toString()}`);
}
