"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram, Driver, Headcount, Loan, Scenario } from "@/models";

export async function createScenario(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await connectToDatabase();
  const s = await Scenario.create({ name });
  revalidatePath("/");
  redirect(`/scenarios/${s._id.toString()}`);
}

export async function setBaseScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  // Atomic-ish: unset any existing base, then set the new one.
  await Scenario.updateMany({ isBase: true }, { $set: { isBase: false } });
  await Scenario.updateOne({ _id: scenarioId }, { $set: { isBase: true } });
  revalidatePath("/");
}

export async function unsetBaseScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  await Scenario.updateOne({ _id: scenarioId }, { $set: { isBase: false } });
  revalidatePath("/");
}

export async function deleteScenario(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  const s = await Scenario.findById(scenarioId).select("isBase").lean<{
    isBase?: boolean;
  }>();
  if (!s) return;
  if (s.isBase) return; // refuse to delete the base scenario
  await Promise.all([
    Driver.deleteMany({ scenarioId }),
    Headcount.deleteMany({ scenarioId }),
    Loan.deleteMany({ scenarioId }),
    CapitalProgram.deleteMany({ scenarioId }),
    Scenario.deleteOne({ _id: scenarioId }),
  ]);
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
  await connectToDatabase();

  const base = await Scenario.findOne({ isBase: true });
  if (!base) return;
  const baseId = base._id as Types.ObjectId;

  // Copy scenario-level assumptions onto the branch so the child stands on its
  // own without back-referencing the base for computation inputs.
  const child = await Scenario.create({
    name,
    parentId: baseId,
    isBase: false,
    status: "draft",
    dsoDays: base.dsoDays,
    dpoDays: base.dpoDays,
    taxRatePct: base.taxRatePct,
    openingCash: base.openingCash,
    openingEquity: base.openingEquity,
    defaultCpiPct: base.defaultCpiPct,
    defaultSuperPct: base.defaultSuperPct,
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
