"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram, Driver, Headcount, Loan, Payband, Scenario } from "@/models";
import { toDecimal128 } from "@/utils/money";
import { parseDecimalInput } from "@/utils/format";
import { parseLoanTape } from "@/lib/parseLoanTape";

export type ProgramFeePayload = {
  name: string;
  category: "senior_mgmt" | "subordinate_mgmt" | "servicing" | "other";
  basisAmount: string;
  feeBps: number;
  accountCode: string;
};
export type ProgramPayload = {
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  dealSize?: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: ProgramFeePayload[];
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function addDriver(scenarioId: string, formData: FormData): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const type = String(formData.get("type") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  if (!name || !accountCode || !PERIOD_RE.test(startPeriodKey)) return;
  await connectToDatabase();
  const base = {
    scenarioId: new Types.ObjectId(scenarioId),
    name,
    accountCode,
    startPeriodKey,
  };
  if (type === "recurring_revenue" || type === "opex_fixed") {
    await Driver.create({
      ...base,
      type,
      baseMonthly: toDecimal128(String(formData.get("baseMonthly") ?? "0")),
      monthlyGrowthPct: toDecimal128(String(formData.get("monthlyGrowthPct") ?? "0")),
    });
  } else if (type === "opex_pct_revenue") {
    await Driver.create({
      ...base,
      type,
      pctOfRevenue: toDecimal128(String(formData.get("pctOfRevenue") ?? "0")),
    });
  } else {
    return;
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function addStaff(scenarioId: string, formData: FormData): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;

  const personName = String(formData.get("personName") ?? "").trim() || undefined;
  const role = String(formData.get("role") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  const endPeriodKey = String(formData.get("endPeriodKey") ?? "").trim() || undefined;
  const employmentType = String(formData.get("employmentType") ?? "full_time") as
    | "full_time"
    | "part_time"
    | "contractor";
  if (!role || !accountCode || !PERIOD_RE.test(startPeriodKey)) return;
  if (endPeriodKey && !PERIOD_RE.test(endPeriodKey)) return;

  const bandRaw = String(formData.get("band") ?? "").trim();
  const tierRaw = String(formData.get("tier") ?? "").trim();
  const band = bandRaw ? Number(bandRaw) : undefined;
  const tier = tierRaw ? Number(tierRaw) : undefined;
  const ftePctRaw = String(formData.get("ftePct") ?? "1");
  const ftePct = ftePctRaw.endsWith("%")
    ? (Number(ftePctRaw.slice(0, -1)) / 100).toString()
    : ftePctRaw;

  await connectToDatabase();

  // If salary not given but band+tier set, inherit from payband.
  let salaryAnnual = String(formData.get("salaryAnnual") ?? "").trim();
  if (!salaryAnnual && band !== undefined && tier !== undefined) {
    const pb = await Payband.findOne({ band, tier }).lean<{
      salaryAnnual?: { toString: () => string };
    }>();
    salaryAnnual = pb?.salaryAnnual?.toString() ?? "0";
  }
  if (!salaryAnnual) salaryAnnual = "0";

  const onCostPct = String(formData.get("onCostPct") ?? "20");

  // CPI + super: per-person override, else scenario default, else fallback (CPI 0 / super 12).
  let cpi = String(formData.get("salaryGrowthPctAnnual") ?? "").trim();
  let superPct = String(formData.get("superPct") ?? "").trim();
  if (!cpi || !superPct) {
    const s = await Scenario.findById(scenarioId)
      .select("defaultCpiPct defaultSuperPct")
      .lean<{
        defaultCpiPct?: { toString: () => string };
        defaultSuperPct?: { toString: () => string };
      }>();
    if (!cpi) cpi = s?.defaultCpiPct?.toString() ?? "0";
    if (!superPct) superPct = s?.defaultSuperPct?.toString() ?? "12";
  }

  await Headcount.create({
    scenarioId: new Types.ObjectId(scenarioId),
    personName,
    role,
    accountCode,
    employmentType,
    ftePct: toDecimal128(ftePct),
    band,
    tier,
    startPeriodKey,
    endPeriodKey,
    salaryAnnual: toDecimal128(salaryAnnual),
    superPct: toDecimal128(superPct),
    onCostPct: toDecimal128(onCostPct),
    salaryGrowthPctAnnual: toDecimal128(cpi),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateStaff(
  scenarioId: string,
  headcountId: string,
  formData: FormData,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(headcountId)) return;

  const personName = String(formData.get("personName") ?? "").trim() || undefined;
  const role = String(formData.get("role") ?? "").trim();
  const accountCode = String(formData.get("accountCode") ?? "").trim();
  const startPeriodKey = String(formData.get("startPeriodKey") ?? "").trim();
  const endPeriodKey = String(formData.get("endPeriodKey") ?? "").trim() || undefined;
  const employmentType = String(formData.get("employmentType") ?? "full_time") as
    | "full_time"
    | "part_time"
    | "contractor";
  if (!role || !accountCode || !PERIOD_RE.test(startPeriodKey)) return;
  if (endPeriodKey && !PERIOD_RE.test(endPeriodKey)) return;

  const bandRaw = String(formData.get("band") ?? "").trim();
  const tierRaw = String(formData.get("tier") ?? "").trim();
  const band = bandRaw ? Number(bandRaw) : undefined;
  const tier = tierRaw ? Number(tierRaw) : undefined;

  const ftePctRaw = String(formData.get("ftePct") ?? "1");
  const ftePct = ftePctRaw.endsWith("%")
    ? (Number(ftePctRaw.slice(0, -1)) / 100).toString()
    : ftePctRaw;

  await connectToDatabase();

  let salaryAnnual = String(formData.get("salaryAnnual") ?? "").trim();
  if (!salaryAnnual && band !== undefined && tier !== undefined) {
    const pb = await Payband.findOne({ band, tier }).lean<{
      salaryAnnual?: { toString: () => string };
    }>();
    salaryAnnual = pb?.salaryAnnual?.toString() ?? "0";
  }
  if (!salaryAnnual) salaryAnnual = "0";

  const onCostPct = String(formData.get("onCostPct") ?? "8");
  const superPct = String(formData.get("superPct") ?? "12");
  const salaryGrowthPctAnnual = String(formData.get("salaryGrowthPctAnnual") ?? "0");

  await Headcount.updateOne(
    { _id: headcountId, scenarioId },
    {
      $set: {
        personName,
        role,
        accountCode,
        employmentType,
        ftePct: toDecimal128(ftePct),
        band,
        tier,
        startPeriodKey,
        endPeriodKey,
        salaryAnnual: toDecimal128(salaryAnnual),
        superPct: toDecimal128(superPct),
        onCostPct: toDecimal128(onCostPct),
        salaryGrowthPctAnnual: toDecimal128(salaryGrowthPctAnnual),
      },
      $unset: {
        ...(personName ? {} : { personName: "" }),
        ...(band !== undefined ? {} : { band: "" }),
        ...(tier !== undefined ? {} : { tier: "" }),
        ...(endPeriodKey ? {} : { endPeriodKey: "" }),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function importLoanTape(
  scenarioId: string,
  formData: FormData,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const mode = String(formData.get("mode") ?? "merge");

  const buffer = await file.arrayBuffer();
  const oid = new Types.ObjectId(scenarioId);
  const loans = await parseLoanTape(buffer, oid);
  if (loans.length === 0) return;

  await connectToDatabase();
  if (mode === "replace") {
    await Loan.deleteMany({ scenarioId: oid });
  }
  const ops = loans.map((l) => ({
    updateOne: {
      filter: { scenarioId: oid, loanId: l.loanId },
      update: { $set: l },
      upsert: true,
    },
  }));
  await Loan.bulkWrite(ops);
  revalidatePath(`/scenarios/${scenarioId}`);
}

const PROGRAM_TYPES = new Set(["CRE_CLO", "CMBS", "MIT_FUND", "WAREHOUSE", "OTHER"]);
const FEE_CATEGORIES = new Set(["senior_mgmt", "subordinate_mgmt", "servicing", "other"]);

export async function createProgram(
  scenarioId: string,
  payload: ProgramPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!payload.name || !PROGRAM_TYPES.has(payload.type)) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  if (payload.endPeriodKey && !PERIOD_RE.test(payload.endPeriodKey)) return;

  const fees = payload.fees
    .filter(
      (f) =>
        f.name &&
        FEE_CATEGORIES.has(f.category) &&
        f.accountCode &&
        Number.isFinite(f.feeBps) &&
        f.feeBps >= 0 &&
        /^-?\d+(\.\d+)?$/.test(parseDecimalInput(f.basisAmount)),
    )
    .map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: toDecimal128(f.basisAmount),
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    }));

  await connectToDatabase();
  await CapitalProgram.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name: payload.name,
    type: payload.type,
    dealSize: payload.dealSize ? toDecimal128(payload.dealSize) : undefined,
    startPeriodKey: payload.startPeriodKey,
    endPeriodKey: payload.endPeriodKey,
    notes: payload.notes,
    fees,
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateProgram(
  scenarioId: string,
  programId: string,
  payload: ProgramPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  if (!payload.name || !PROGRAM_TYPES.has(payload.type)) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  if (payload.endPeriodKey && !PERIOD_RE.test(payload.endPeriodKey)) return;

  const fees = payload.fees
    .filter(
      (f) =>
        f.name &&
        FEE_CATEGORIES.has(f.category) &&
        f.accountCode &&
        Number.isFinite(f.feeBps) &&
        f.feeBps >= 0 &&
        /^-?\d+(\.\d+)?$/.test(parseDecimalInput(f.basisAmount)),
    )
    .map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: toDecimal128(f.basisAmount),
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    }));

  await connectToDatabase();
  await CapitalProgram.updateOne(
    { _id: programId, scenarioId },
    {
      $set: {
        name: payload.name,
        type: payload.type,
        dealSize: payload.dealSize ? toDecimal128(payload.dealSize) : undefined,
        startPeriodKey: payload.startPeriodKey,
        endPeriodKey: payload.endPeriodKey,
        notes: payload.notes,
        fees,
      },
      $unset: {
        ...(payload.dealSize ? {} : { dealSize: "" }),
        ...(payload.endPeriodKey ? {} : { endPeriodKey: "" }),
        ...(payload.notes ? {} : { notes: "" }),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteProgram(scenarioId: string, programId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  await connectToDatabase();
  await CapitalProgram.deleteOne({ _id: programId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function clearLoanTape(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  await connectToDatabase();
  await Loan.deleteMany({ scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteStaff(scenarioId: string, headcountId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(headcountId)) return;
  await connectToDatabase();
  await Headcount.deleteOne({ _id: headcountId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}
