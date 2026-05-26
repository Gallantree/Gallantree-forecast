"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { generateStructured, isAnthropicConfigured } from "@/lib/anthropic";
import { assertScenarioAccess } from "@/lib/assertScenarioAccess";
import { getCurrentUser } from "@/lib/currentUser";
import { connectToDatabase } from "@/lib/db";
import { parseLoanTape } from "@/lib/parseLoanTape";
import {
  BSL_SEED,
  CMBS_SEED,
  CRE_CLO_SEED,
  FY_LOANS_SEED,
  type FySeedLoanRow,
  LOAN_BOOK_SEED,
  type LoanStyle,
  type SeedLoan,
  type SeedProgram,
  WAREHOUSE_SEED,
} from "@/lib/seedSpecs";
import {
  Account,
  CapitalProgram,
  CapitalRaise,
  Driver,
  Headcount,
  Loan,
  Payband,
  PlatformLicense,
  Scenario,
  Shareholder,
} from "@/models";
import type { ArrearsStatus } from "@/models/loan.model";
import { DEFAULT_COA } from "@/seed/coa";
import {
  ENHANCED_FUND_MGMT_FEE_BPS,
  ENHANCED_FUND_UNIT_RETURN_BPS,
  GALLANTREE_ENHANCED_FUNDS,
} from "@/seed/gallantreeEnhancedFunds";
import { GALLANTREE_OPEX_SEED } from "@/seed/gallantreeOpex";
import {
  GALLANTREE_STAFF_SEED,
  STAFF_BUMP_PRECEDING_PERIOD_KEY,
  STAFF_BUMP_START_PERIOD_KEY,
  STAFF_PHASE_1_START_PERIOD_KEY,
} from "@/seed/gallantreeStaff";
import { parseDecimalInput } from "@/utils/format";
import { toDecimal128 } from "@/utils/money";

export type ProgramFeePayload = {
  name: string;
  category: "senior_mgmt" | "subordinate_mgmt" | "servicing" | "trustee" | "other";
  basisAmount: string;
  feeBps: number;
  accountCode: string;
};

export type ProgramLiabilityPayload = {
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: "monthly" | "quarterly" | "annually";
  rateType: "fixed" | "variable";
  accountCode?: string;
};

export type ProgramUpfrontFeePayload = {
  name: string;
  category: "underwriter" | "legal" | "credit_rating" | "other";
  amount: string;
  accountCode?: string;
};
export type ProgramPayload = {
  name: string;
  type: "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";
  dealSize?: string;
  faceValuePerNote?: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  // Decimal fraction (0.03 = 3%). The UI takes a whole percent and converts.
  arrearsPctTarget?: string;
  // Decimal fraction (0.33 = 33%) — Gallantree's share of servicing fees.
  // UI sends whole percent ("33") that we convert before persisting.
  gallantreeSharePct?: string;
  // Stepped monthly ramp-up — number of months. 0/undefined → no ramp.
  rampUpMonths?: number;
  // Linear tail amortisation — number of months. 0/undefined → bullet.
  amortisationMonths?: number;
  fees: ProgramFeePayload[];
  liabilities?: ProgramLiabilityPayload[];
  upfrontFees?: ProgramUpfrontFeePayload[];
};

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Private guard: resolves the current user and verifies they have access to
// the given scenario. Returns the user on success, null on failure (caller
// should silently return — same pattern as an invalid ObjectId early-out).
async function checkAccess(scenarioId: string) {
  const me = await getCurrentUser();
  await connectToDatabase();
  const result = await assertScenarioAccess(scenarioId, me);
  if (!result.ok) return null;
  return me;
}

export async function addDriver(scenarioId: string, formData: FormData): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
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
  if (!(await checkAccess(scenarioId))) return;

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
    const s = await Scenario.findById(scenarioId).select("defaultCpiPct defaultSuperPct").lean<{
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
  if (!(await checkAccess(scenarioId))) return;

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

export async function importLoanTape(scenarioId: string, formData: FormData): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
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
const FEE_CATEGORIES = new Set([
  "senior_mgmt",
  "subordinate_mgmt",
  "servicing",
  "trustee",
  "other",
]);
const LIABILITY_CALC_METHODS = new Set(["monthly", "quarterly", "annually"]);
const LIABILITY_RATE_TYPES = new Set(["fixed", "variable"]);
const UPFRONT_FEE_CATEGORIES = new Set(["underwriter", "legal", "credit_rating", "other"]);

function sanitiseUpfrontFees(payload: ProgramPayload) {
  const list = payload.upfrontFees ?? [];
  return list
    .filter((u) => {
      if (!u.name?.trim()) return false;
      if (!UPFRONT_FEE_CATEGORIES.has(u.category)) return false;
      // Test the raw input (with commas/whitespace stripped) — not
      // parseDecimalInput, which silently coerces garbage to "0" and would
      // let "not-a-number" slip through before toDecimal128() throws.
      const stripped = String(u.amount ?? "").replace(/[,\s]/g, "");
      return /^-?\d+(\.\d+)?$/.test(stripped);
    })
    .map((u) => ({
      name: u.name.trim(),
      category: u.category,
      amount: toDecimal128(parseDecimalInput(u.amount)),
      accountCode: u.accountCode?.trim() || undefined,
    }));
}

function sanitiseLiabilities(payload: ProgramPayload) {
  const list = payload.liabilities ?? [];
  return list
    .filter(
      (l) =>
        l.name?.trim() &&
        LIABILITY_CALC_METHODS.has(l.calculationMethod) &&
        LIABILITY_RATE_TYPES.has(l.rateType) &&
        Number.isFinite(l.returnProfileBps) &&
        l.returnProfileBps >= 0,
    )
    .map((l) => ({
      name: l.name.trim(),
      numNotes: Number.isFinite(l.numNotes) ? l.numNotes : undefined,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode?.trim() || undefined,
    }));
}

export async function createProgram(scenarioId: string, payload: ProgramPayload): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
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
    faceValuePerNote: payload.faceValuePerNote ? toDecimal128(payload.faceValuePerNote) : undefined,
    startPeriodKey: payload.startPeriodKey,
    endPeriodKey: payload.endPeriodKey,
    notes: payload.notes,
    arrearsPctTarget: payload.arrearsPctTarget ? toDecimal128(payload.arrearsPctTarget) : undefined,
    gallantreeSharePct: payload.gallantreeSharePct
      ? toDecimal128(payload.gallantreeSharePct)
      : undefined,
    rampUpMonths:
      Number.isFinite(payload.rampUpMonths) && (payload.rampUpMonths as number) > 0
        ? Math.floor(payload.rampUpMonths as number)
        : undefined,
    amortisationMonths:
      Number.isFinite(payload.amortisationMonths) && (payload.amortisationMonths as number) > 0
        ? Math.floor(payload.amortisationMonths as number)
        : undefined,
    fees,
    liabilities: sanitiseLiabilities(payload),
    upfrontFees: sanitiseUpfrontFees(payload),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

/**
 * Replace a fund's captive equity-tranche holdings. `holdings` is the
 * full new list — anything not in it is removed. Each item references a
 * program by ID and the exact tranche name (case-sensitive) on that
 * program. Only valid for MIT_FUND programs; calls on other types
 * silently no-op.
 */
export async function updateEquityHoldings(
  scenarioId: string,
  programId: string,
  holdings: Array<{ programId: string; trancheName: string }>,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  const docs = holdings
    .filter((h) => Types.ObjectId.isValid(h.programId) && h.trancheName.trim())
    .map((h) => ({
      programId: new Types.ObjectId(h.programId),
      trancheName: h.trancheName.trim(),
    }));
  await CapitalProgram.updateOne(
    { _id: programId, scenarioId, type: "MIT_FUND" },
    { $set: { captiveEquityHoldings: docs } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateProgram(
  scenarioId: string,
  programId: string,
  payload: ProgramPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  if (!(await checkAccess(scenarioId))) return;
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

  const rampValid = Number.isFinite(payload.rampUpMonths) && (payload.rampUpMonths as number) > 0;
  const amortValid =
    Number.isFinite(payload.amortisationMonths) && (payload.amortisationMonths as number) > 0;

  await connectToDatabase();
  await CapitalProgram.updateOne(
    { _id: programId, scenarioId },
    {
      $set: {
        name: payload.name,
        type: payload.type,
        dealSize: payload.dealSize ? toDecimal128(payload.dealSize) : undefined,
        faceValuePerNote: payload.faceValuePerNote
          ? toDecimal128(payload.faceValuePerNote)
          : undefined,
        startPeriodKey: payload.startPeriodKey,
        endPeriodKey: payload.endPeriodKey,
        notes: payload.notes,
        arrearsPctTarget: payload.arrearsPctTarget
          ? toDecimal128(payload.arrearsPctTarget)
          : undefined,
        gallantreeSharePct: payload.gallantreeSharePct
          ? toDecimal128(payload.gallantreeSharePct)
          : undefined,
        ...(rampValid ? { rampUpMonths: Math.floor(payload.rampUpMonths as number) } : {}),
        ...(amortValid
          ? { amortisationMonths: Math.floor(payload.amortisationMonths as number) }
          : {}),
        fees,
        liabilities: sanitiseLiabilities(payload),
        upfrontFees: sanitiseUpfrontFees(payload),
      },
      $unset: {
        ...(payload.dealSize ? {} : { dealSize: "" }),
        ...(payload.faceValuePerNote ? {} : { faceValuePerNote: "" }),
        ...(payload.endPeriodKey ? {} : { endPeriodKey: "" }),
        ...(payload.notes ? {} : { notes: "" }),
        ...(payload.arrearsPctTarget ? {} : { arrearsPctTarget: "" }),
        ...(payload.gallantreeSharePct ? {} : { gallantreeSharePct: "" }),
        ...(rampValid ? {} : { rampUpMonths: "" }),
        ...(amortValid ? {} : { amortisationMonths: "" }),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteProgram(scenarioId: string, programId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await CapitalProgram.deleteOne({ _id: programId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export type LiabilityTranchePayload = {
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: "monthly" | "quarterly" | "annually";
  rateType: "fixed" | "variable";
  accountCode?: string;
};

export async function updateLiabilityTranche(
  scenarioId: string,
  programId: string,
  trancheId: string,
  payload: LiabilityTranchePayload,
): Promise<void> {
  if (
    !Types.ObjectId.isValid(scenarioId) ||
    !Types.ObjectId.isValid(programId) ||
    !Types.ObjectId.isValid(trancheId)
  )
    return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim()) return;
  if (!LIABILITY_CALC_METHODS.has(payload.calculationMethod)) return;
  if (!LIABILITY_RATE_TYPES.has(payload.rateType)) return;
  if (!Number.isFinite(payload.returnProfileBps) || payload.returnProfileBps < 0) return;

  await connectToDatabase();
  await CapitalProgram.updateOne(
    { _id: programId, scenarioId, "liabilities._id": trancheId },
    {
      $set: {
        "liabilities.$.name": payload.name.trim(),
        "liabilities.$.returnProfileBps": payload.returnProfileBps,
        "liabilities.$.calculationMethod": payload.calculationMethod,
        "liabilities.$.rateType": payload.rateType,
        ...(Number.isFinite(payload.numNotes) && (payload.numNotes as number) >= 0
          ? { "liabilities.$.numNotes": payload.numNotes }
          : {}),
        ...(payload.accountCode?.trim()
          ? { "liabilities.$.accountCode": payload.accountCode.trim() }
          : {}),
      },
      ...(payload.accountCode?.trim() ? {} : { $unset: { "liabilities.$.accountCode": "" } }),
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function cloneProgram(scenarioId: string, programId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  const src = await CapitalProgram.findOne({ _id: programId, scenarioId }).lean();
  if (!src) return;
  await CapitalProgram.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name: `${src.name} (copy)`,
    type: src.type,
    dealSize: src.dealSize,
    faceValuePerNote: src.faceValuePerNote,
    startPeriodKey: src.startPeriodKey,
    endPeriodKey: src.endPeriodKey,
    notes: src.notes,
    fees: src.fees.map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: f.basisAmount,
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
    liabilities: src.liabilities.map((l) => ({
      name: l.name,
      numNotes: l.numNotes,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode,
    })),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

// Scale the program's liability tranches (and dealSize / fee basisAmounts)
// down to match the aggregate balance of loans currently assigned to it.
// Tranche numNotes are scaled by the same factor so the cap-stack mix is
// preserved; new dealSize = sum(new numNotes) × faceValuePerNote.
export async function calibrateProgram(
  scenarioId: string,
  programId: string,
): Promise<{ ok: boolean; error?: string; newDealSize?: string }> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(programId)) {
    return { ok: false, error: "invalid id" };
  }
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  await connectToDatabase();
  const program = await CapitalProgram.findOne({
    _id: programId,
    scenarioId,
  }).lean();
  if (!program) return { ok: false, error: "program not found" };

  const faceValue = program.faceValuePerNote ? Number(program.faceValuePerNote.toString()) : 0;
  if (faceValue <= 0) {
    return { ok: false, error: "program has no face value per note" };
  }

  const loans = await Loan.find({
    scenarioId,
    capitalProgramId: programId,
    includeInRevenue: { $ne: false },
  })
    .select("balance")
    .lean<Array<{ balance: { toString: () => string } }>>();
  let targetBalance = 0;
  for (const l of loans) targetBalance += Number(l.balance.toString());
  if (targetBalance <= 0) {
    return {
      ok: false,
      error: "no loans assigned to this program — assign loans first",
    };
  }

  const oldTotalNotes = (program.liabilities ?? []).reduce((acc, l) => acc + (l.numNotes ?? 0), 0);
  const oldTotalPrincipal = oldTotalNotes * faceValue;
  if (oldTotalPrincipal <= 0) {
    return { ok: false, error: "program has no liability principal to scale" };
  }
  const scale = targetBalance / oldTotalPrincipal;

  const newLiabilities = (program.liabilities ?? []).map((l) => ({
    name: l.name,
    numNotes: Math.max(0, Math.round((l.numNotes ?? 0) * scale)),
    returnProfileBps: l.returnProfileBps,
    calculationMethod: l.calculationMethod,
    rateType: l.rateType,
    accountCode: l.accountCode,
  }));
  const newTotalNotes = newLiabilities.reduce((acc, l) => acc + l.numNotes, 0);
  const newDealSize = newTotalNotes * faceValue;

  // Fee basisAmount scales by the same factor so fee economics stay
  // proportional to the new deal size.
  const newFees = (program.fees ?? []).map((f) => ({
    name: f.name,
    category: f.category,
    basisAmount: toDecimal128((Number(f.basisAmount.toString()) * scale).toFixed(2)),
    feeBps: f.feeBps,
    accountCode: f.accountCode,
  }));

  await CapitalProgram.updateOne(
    { _id: programId, scenarioId },
    {
      $set: {
        dealSize: toDecimal128(newDealSize.toFixed(2)),
        fees: newFees,
        liabilities: newLiabilities,
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
  return { ok: true, newDealSize: newDealSize.toFixed(2) };
}

export type ValuationAssumptionsPayload = {
  waccPct?: string;
  terminalGrowthPct?: string;
  evEbitdaMultiple?: string;
  evRevenueMultiple?: string;
  peMultiple?: string;
  netDebt?: string;
  pbMultiple?: string;
};

export async function updateValuationAssumptions(
  scenarioId: string,
  payload: ValuationAssumptionsPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  const update: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  const fields: (keyof ValuationAssumptionsPayload)[] = [
    "waccPct",
    "terminalGrowthPct",
    "evEbitdaMultiple",
    "evRevenueMultiple",
    "peMultiple",
    "netDebt",
    "pbMultiple",
  ];
  for (const f of fields) {
    const v = payload[f];
    const trimmed = v === undefined ? undefined : String(v).trim();
    if (!trimmed) {
      unset[f] = "";
    } else {
      update[f] = toDecimal128(trimmed);
    }
  }
  await Scenario.updateOne(
    { _id: scenarioId },
    {
      ...(Object.keys(update).length ? { $set: update } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateLoanBookGrowth(scenarioId: string, formData: FormData): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  // Form sends loanBookGrowthPctY0, …Y1, … one entry per FY in the horizon.
  const raws: string[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("loanBookGrowthPctY")) {
      raws.push(String(val).trim());
    }
  }
  await connectToDatabase();
  // Parse + validate each entry; treat blanks as 0%.
  const parsed: ReturnType<typeof toDecimal128>[] = [];
  for (const raw of raws) {
    if (!raw) {
      parsed.push(toDecimal128("0"));
      continue;
    }
    const cleaned = raw.replace(/[,\s]/g, "");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return;
    parsed.push(toDecimal128(cleaned));
  }
  if (parsed.length === 0 || parsed.every((d) => d.toString() === "0.00000000")) {
    await Scenario.updateOne({ _id: scenarioId }, { $unset: { loanBookGrowthPctByYear: "" } });
  } else {
    await Scenario.updateOne({ _id: scenarioId }, { $set: { loanBookGrowthPctByYear: parsed } });
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

const RISK_LEVELS = new Set(["low", "medium", "high"]);

export type BookGrowthProfilePayload = {
  capitalProgramId: string;
  fyGrowthPcts: string[]; // one per FY
  avgTenorMonths: number;
  avgSpreadBps: number;
  riskLevel: "low" | "medium" | "high";
};

function sanitiseGrowthProfile(p: BookGrowthProfilePayload) {
  if (!Types.ObjectId.isValid(p.capitalProgramId)) return null;
  if (!RISK_LEVELS.has(p.riskLevel)) return null;
  if (!Number.isFinite(p.avgTenorMonths) || p.avgTenorMonths <= 0) return null;
  if (!Number.isFinite(p.avgSpreadBps) || p.avgSpreadBps < 0) return null;
  const pcts = p.fyGrowthPcts.map((raw) => {
    const cleaned = String(raw ?? "")
      .trim()
      .replace(/[,\s]/g, "");
    if (!cleaned) return toDecimal128("0");
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
    return toDecimal128(cleaned);
  });
  if (pcts.some((p) => p === null)) return null;
  return {
    capitalProgramId: new Types.ObjectId(p.capitalProgramId),
    fyGrowthPcts: pcts as ReturnType<typeof toDecimal128>[],
    avgTenorMonths: Math.round(p.avgTenorMonths),
    avgSpreadBps: Math.round(p.avgSpreadBps),
    riskLevel: p.riskLevel,
  };
}

export async function addBookGrowthProfile(
  scenarioId: string,
  payload: BookGrowthProfilePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const sanitised = sanitiseGrowthProfile(payload);
  if (!sanitised) return;
  await connectToDatabase();
  await Scenario.updateOne({ _id: scenarioId }, { $push: { bookGrowthProfiles: sanitised } });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateBookGrowthProfile(
  scenarioId: string,
  profileId: string,
  payload: BookGrowthProfilePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(profileId)) {
    return;
  }
  if (!(await checkAccess(scenarioId))) return;
  const sanitised = sanitiseGrowthProfile(payload);
  if (!sanitised) return;
  await connectToDatabase();
  await Scenario.updateOne(
    { _id: scenarioId, "bookGrowthProfiles._id": profileId },
    {
      $set: {
        "bookGrowthProfiles.$.capitalProgramId": sanitised.capitalProgramId,
        "bookGrowthProfiles.$.fyGrowthPcts": sanitised.fyGrowthPcts,
        "bookGrowthProfiles.$.avgTenorMonths": sanitised.avgTenorMonths,
        "bookGrowthProfiles.$.avgSpreadBps": sanitised.avgSpreadBps,
        "bookGrowthProfiles.$.riskLevel": sanitised.riskLevel,
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteBookGrowthProfile(
  scenarioId: string,
  profileId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(profileId)) {
    return;
  }
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Scenario.updateOne(
    { _id: scenarioId },
    { $pull: { bookGrowthProfiles: { _id: new Types.ObjectId(profileId) } } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function toggleLoanIncluded(
  scenarioId: string,
  loanId: string,
  include: boolean,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Loan.updateOne({ _id: loanId, scenarioId }, { $set: { includeInRevenue: include } });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function setLoanProgram(
  scenarioId: string,
  loanId: string,
  formData: FormData,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const programId = String(formData.get("capitalProgramId") ?? "").trim();
  await connectToDatabase();
  if (!programId) {
    await Loan.updateOne({ _id: loanId, scenarioId }, { $unset: { capitalProgramId: "" } });
  } else if (Types.ObjectId.isValid(programId)) {
    await Loan.updateOne(
      { _id: loanId, scenarioId },
      { $set: { capitalProgramId: new Types.ObjectId(programId) } },
    );
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

export type LoanEditPayload = {
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  capitalProgramId?: string;
  balance: string;
  originationDate: string; // YYYY-MM-DD
  maturityDate: string;
  termMonths: number;
  creditSpreadBps?: number;
  internalScore?: number;
  internalGrade?: string;
  lvr?: string; // ratio 0..1
  dscr?: string;
};

export async function updateLoan(
  scenarioId: string,
  loanId: string,
  payload: LoanEditPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.loanId.trim()) return;
  const origination = new Date(payload.originationDate);
  const maturity = new Date(payload.maturityDate);
  if (Number.isNaN(origination.getTime()) || Number.isNaN(maturity.getTime())) return;
  if (!Number.isFinite(payload.termMonths) || payload.termMonths < 1) return;

  const set: Record<string, unknown> = {
    loanId: payload.loanId.trim(),
    borrower: payload.borrower?.trim() || undefined,
    lenderOfRecord: payload.lenderOfRecord?.trim() || undefined,
    balance: toDecimal128(payload.balance),
    originationDate: origination,
    maturityDate: maturity,
    termMonths: payload.termMonths,
  };
  if (payload.capitalProgramId && Types.ObjectId.isValid(payload.capitalProgramId)) {
    set.capitalProgramId = new Types.ObjectId(payload.capitalProgramId);
  }
  if (payload.creditSpreadBps !== undefined) set.creditSpreadBps = payload.creditSpreadBps;
  if (payload.internalScore !== undefined) set.internalScore = payload.internalScore;
  if (payload.internalGrade) set.internalGrade = payload.internalGrade.trim();
  if (payload.lvr) set.lvr = toDecimal128(payload.lvr);
  if (payload.dscr) set.dscr = toDecimal128(payload.dscr);

  const unset: Record<string, ""> = {};
  if (!payload.borrower) unset.borrower = "";
  if (!payload.lenderOfRecord) unset.lenderOfRecord = "";
  if (!payload.capitalProgramId) unset.capitalProgramId = "";

  await connectToDatabase();
  await Loan.updateOne(
    { _id: loanId, scenarioId },
    {
      $set: set,
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── OPEX drivers (non-staff) ──

export type OpexDriverPayload =
  | {
      type: "opex_fixed";
      name: string;
      accountCode: string;
      startPeriodKey: string;
      endPeriodKey?: string;
      baseMonthly: string;
      monthlyGrowthPct: string;
    }
  | {
      type: "opex_pct_revenue";
      name: string;
      accountCode: string;
      startPeriodKey: string;
      endPeriodKey?: string;
      pctOfRevenue: string;
    }
  | {
      type: "opex_per_fte";
      name: string;
      accountCode: string;
      startPeriodKey: string;
      endPeriodKey?: string;
      costPerFteMonthly: string;
    };

const OPEX_DRIVER_TYPES = new Set(["opex_fixed", "opex_pct_revenue", "opex_per_fte"]);

function buildDriverDoc(payload: OpexDriverPayload): Record<string, unknown> {
  const base = {
    name: payload.name.trim(),
    type: payload.type,
    accountCode: payload.accountCode,
    startPeriodKey: payload.startPeriodKey,
    ...(payload.endPeriodKey ? { endPeriodKey: payload.endPeriodKey } : {}),
  };
  if (payload.type === "opex_fixed") {
    return {
      ...base,
      baseMonthly: toDecimal128(payload.baseMonthly),
      monthlyGrowthPct: toDecimal128(payload.monthlyGrowthPct),
    };
  }
  if (payload.type === "opex_pct_revenue") {
    return {
      ...base,
      pctOfRevenue: toDecimal128(payload.pctOfRevenue),
    };
  }
  return {
    ...base,
    costPerFteMonthly: toDecimal128(payload.costPerFteMonthly),
  };
}

export async function createOpexDriver(
  scenarioId: string,
  payload: OpexDriverPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!OPEX_DRIVER_TYPES.has(payload.type)) return;
  if (!payload.name?.trim() || !payload.accountCode) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  await connectToDatabase();
  await Driver.create({
    scenarioId: new Types.ObjectId(scenarioId),
    ...buildDriverDoc(payload),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateOpexDriver(
  scenarioId: string,
  driverId: string,
  payload: OpexDriverPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(driverId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!OPEX_DRIVER_TYPES.has(payload.type)) return;
  if (!payload.name?.trim() || !payload.accountCode) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  await connectToDatabase();

  const set = buildDriverDoc(payload);
  // Clear fields owned by the OTHER OPEX types so a type-switch doesn't leave
  // stale numbers attached.
  const unset: Record<string, ""> = {};
  if (payload.type !== "opex_fixed") {
    unset.baseMonthly = "";
    unset.monthlyGrowthPct = "";
  }
  if (payload.type !== "opex_pct_revenue") {
    unset.pctOfRevenue = "";
  }
  if (payload.type !== "opex_per_fte") {
    unset.costPerFteMonthly = "";
  }
  if (!payload.endPeriodKey) unset.endPeriodKey = "";

  await Driver.updateOne({ _id: driverId, scenarioId }, { $set: set, $unset: unset });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteOpexDriver(scenarioId: string, driverId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(driverId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Driver.deleteOne({ _id: driverId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── CAPEX drivers ──

export type CapexDriverPayload = {
  name: string;
  accountCode: string;
  inServicePeriodKey: string;
  cost: string;
  usefulLifeMonths: number;
};

export async function createCapexDriver(
  scenarioId: string,
  payload: CapexDriverPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !payload.accountCode) return;
  if (!PERIOD_RE.test(payload.inServicePeriodKey)) return;
  const cost = Number(payload.cost);
  if (!Number.isFinite(cost) || cost <= 0) return;
  const uli = Math.floor(payload.usefulLifeMonths);
  if (uli < 1) return;
  await connectToDatabase();
  await Driver.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name: payload.name.trim(),
    type: "capex_straight_line",
    accountCode: payload.accountCode,
    startPeriodKey: payload.inServicePeriodKey,
    inServicePeriodKey: payload.inServicePeriodKey,
    cost: toDecimal128(payload.cost),
    usefulLifeMonths: uli,
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateCapexDriver(
  scenarioId: string,
  driverId: string,
  payload: CapexDriverPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(driverId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !payload.accountCode) return;
  if (!PERIOD_RE.test(payload.inServicePeriodKey)) return;
  const cost = Number(payload.cost);
  if (!Number.isFinite(cost) || cost <= 0) return;
  const uli = Math.floor(payload.usefulLifeMonths);
  if (uli < 1) return;
  await connectToDatabase();
  await Driver.updateOne(
    { _id: driverId, scenarioId },
    {
      $set: {
        name: payload.name.trim(),
        accountCode: payload.accountCode,
        startPeriodKey: payload.inServicePeriodKey,
        inServicePeriodKey: payload.inServicePeriodKey,
        cost: toDecimal128(payload.cost),
        usefulLifeMonths: uli,
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteCapexDriver(scenarioId: string, driverId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(driverId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Driver.deleteOne({ _id: driverId, scenarioId, type: "capex_straight_line" });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function batchCreateCapexDrivers(
  scenarioId: string,
  payloads: CapexDriverPayload[],
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  const docs = payloads
    .filter(
      (p) =>
        p.name?.trim() &&
        p.accountCode &&
        PERIOD_RE.test(p.inServicePeriodKey) &&
        Number.isFinite(Number(p.cost)) &&
        Number(p.cost) > 0 &&
        Math.floor(p.usefulLifeMonths) >= 1,
    )
    .map((p) => ({
      scenarioId: new Types.ObjectId(scenarioId),
      name: p.name.trim(),
      type: "capex_straight_line",
      accountCode: p.accountCode,
      startPeriodKey: p.inServicePeriodKey,
      inServicePeriodKey: p.inServicePeriodKey,
      cost: toDecimal128(p.cost),
      usefulLifeMonths: Math.floor(p.usefulLifeMonths),
    }));
  if (docs.length > 0) await Driver.insertMany(docs);
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── Platform licenses (compliance + trustee) ──

export type PlatformLicensePayload = {
  name: string;
  type: "compliance" | "trustee";
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  // compliance
  tier?: "starter" | "standard" | "professional" | "custom";
  monthlyFeePerSeat?: string;
  seatCount?: number;
  seatGrowthPctAnnual?: string;
  billingFrequency?: "monthly" | "annual";
  annualDiscountPct?: string;
  // trustee
  monthlyFee?: string;
  configFee?: string;
  aumByYear?: string[];
  feePctOfAumByYear?: string[];
};

const LICENSE_TYPES = new Set(["compliance", "trustee"]);

function buildLicenseDoc(payload: PlatformLicensePayload): Record<string, unknown> {
  const doc: Record<string, unknown> = {
    name: payload.name.trim(),
    type: payload.type,
    startPeriodKey: payload.startPeriodKey,
  };
  if (payload.endPeriodKey) doc.endPeriodKey = payload.endPeriodKey;
  if (payload.notes) doc.notes = payload.notes.trim();
  if (payload.type === "compliance") {
    if (payload.tier) doc.tier = payload.tier;
    if (payload.monthlyFeePerSeat) doc.monthlyFeePerSeat = toDecimal128(payload.monthlyFeePerSeat);
    if (payload.seatCount !== undefined) doc.seatCount = payload.seatCount;
    if (payload.seatGrowthPctAnnual)
      doc.seatGrowthPctAnnual = toDecimal128(payload.seatGrowthPctAnnual);
    if (payload.billingFrequency) doc.billingFrequency = payload.billingFrequency;
    if (payload.annualDiscountPct) doc.annualDiscountPct = toDecimal128(payload.annualDiscountPct);
  } else {
    if (payload.monthlyFee) doc.monthlyFee = toDecimal128(payload.monthlyFee);
    if (payload.configFee) doc.configFee = toDecimal128(payload.configFee);
    if (payload.aumByYear) {
      doc.aumByYear = payload.aumByYear.map((v) => toDecimal128(v || "0"));
    }
    if (payload.feePctOfAumByYear) {
      doc.feePctOfAumByYear = payload.feePctOfAumByYear.map((v) => toDecimal128(v || "0"));
    }
  }
  return doc;
}

export async function createPlatformLicense(
  scenarioId: string,
  payload: PlatformLicensePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !LICENSE_TYPES.has(payload.type)) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  await connectToDatabase();
  await PlatformLicense.create({
    scenarioId: new Types.ObjectId(scenarioId),
    ...buildLicenseDoc(payload),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updatePlatformLicense(
  scenarioId: string,
  licenseId: string,
  payload: PlatformLicensePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(licenseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !LICENSE_TYPES.has(payload.type)) return;
  if (!PERIOD_RE.test(payload.startPeriodKey)) return;
  await connectToDatabase();
  const set = buildLicenseDoc(payload);
  // Clear the opposite-type fields when switching modes.
  const unset: Record<string, ""> = {};
  if (payload.type === "compliance") {
    unset.monthlyFee = "";
    unset.configFee = "";
    unset.aumByYear = "";
    unset.feePctOfAumByYear = "";
  } else {
    unset.tier = "";
    unset.monthlyFeePerSeat = "";
    unset.seatCount = "";
    unset.seatGrowthPctAnnual = "";
    unset.billingFrequency = "";
    unset.annualDiscountPct = "";
  }
  if (!payload.endPeriodKey) unset.endPeriodKey = "";
  if (!payload.notes) unset.notes = "";
  await PlatformLicense.updateOne({ _id: licenseId, scenarioId }, { $set: set, $unset: unset });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deletePlatformLicense(scenarioId: string, licenseId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(licenseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await PlatformLicense.deleteOne({ _id: licenseId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteLoan(scenarioId: string, loanId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Loan.deleteOne({ _id: loanId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── Scenario meta (name + status) ──

export type ScenarioMetaPayload = {
  name: string;
  status: "draft" | "active" | "archived";
};

const SCENARIO_STATUSES = new Set(["draft", "active", "archived"]);

export async function updateScenarioMeta(
  scenarioId: string,
  payload: ScenarioMetaPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const name = payload.name?.trim();
  if (!name || name.length > 120) return;
  if (!SCENARIO_STATUSES.has(payload.status)) return;
  await connectToDatabase();
  await Scenario.updateOne({ _id: scenarioId }, { $set: { name, status: payload.status } });
  revalidatePath(`/scenarios/${scenarioId}`);
  revalidatePath("/");
}

// ── Control Panel ──

export type ControlPanelPayload = {
  baseRateType?: "BBSW" | "BBSY" | "SOFR";
  baseRateBps?: number;
  firstYearLabel?: number;
  taxRatePct?: number;
};

const BASE_RATE_TYPES = new Set(["BBSW", "BBSY", "SOFR"]);

export async function updateControlPanel(
  scenarioId: string,
  payload: ControlPanelPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const set: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};
  if (payload.baseRateType && BASE_RATE_TYPES.has(payload.baseRateType)) {
    set.baseRateType = payload.baseRateType;
  } else {
    unset.baseRateType = "";
  }
  if (Number.isFinite(payload.baseRateBps) && (payload.baseRateBps as number) >= 0) {
    set.baseRateBps = payload.baseRateBps;
  } else {
    unset.baseRateBps = "";
  }
  if (
    Number.isFinite(payload.firstYearLabel) &&
    (payload.firstYearLabel as number) >= 2000 &&
    (payload.firstYearLabel as number) <= 2100
  ) {
    set.firstYearLabel = payload.firstYearLabel;
  } else {
    unset.firstYearLabel = "";
  }
  if (
    Number.isFinite(payload.taxRatePct) &&
    (payload.taxRatePct as number) >= 0 &&
    (payload.taxRatePct as number) <= 100
  ) {
    set.taxRatePct = toDecimal128(String(payload.taxRatePct));
  } else {
    unset.taxRatePct = "";
  }
  await connectToDatabase();
  await Scenario.updateOne(
    { _id: scenarioId },
    {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

/**
 * Wipe every scenario-scoped collection so the user can reseed cleanly
 * — used after switching the fiscal/calendar-year convention so existing
 * period keys don't end up mid-column under the new grouping.
 *
 * Scenario-level assumptions (openingCash, viewMode, firstYearLabel, etc.)
 * are kept. Only the bulk operational data is dropped.
 */
export async function wipeScenarioData(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  const oid = new Types.ObjectId(scenarioId);
  await Promise.all([
    Driver.deleteMany({ scenarioId: oid }),
    Headcount.deleteMany({ scenarioId: oid }),
    Loan.deleteMany({ scenarioId: oid }),
    CapitalProgram.deleteMany({ scenarioId: oid }),
    PlatformLicense.deleteMany({ scenarioId: oid }),
    CapitalRaise.deleteMany({ scenarioId: oid }),
  ]);
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function clearLoanTape(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Loan.deleteMany({ scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

// Wipe every CapitalProgram for the scenario in one shot. Loans tied to
// those programs keep their existing capitalProgramId — same dangling-FK
// behaviour as the single-program deleteProgram() above, so the user can
// re-seed programs and re-link loans without losing the loan tape.
export async function clearAllPrograms(scenarioId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await CapitalProgram.deleteMany({ scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

/**
 * Sets per-FY target headcount and regenerates the placeholder Headcount
 * documents (isGrowth: true) that fill the gap between current actual staff
 * and each FY target.
 *
 * targets[i] is the end-of-FY total headcount for forecast year i+1. Each
 * year's delta is computed against the prior year's running total (current
 * actual at year 0, previous year's target thereafter). Placeholders are
 * created with the scenario's average salary + default CPI/super so they
 * flow through the staffing cost engine like real staff. They land at the
 * first month of the FY (Jul 1) so the full year's cost is captured.
 */
export async function setStaffGrowthTargets(scenarioId: string, targets: number[]): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!Array.isArray(targets) || targets.length === 0) return;

  await connectToDatabase();
  const scenarioOid = new Types.ObjectId(scenarioId);

  // Save the targets on the scenario for the modal to round-trip later.
  // Clamp to integers ≥ 0 and persist length-as-given (5 typical).
  const cleanTargets = targets.map((n) => (Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0));
  await Scenario.updateOne({ _id: scenarioOid }, { $set: { staffTargetByYear: cleanTargets } });

  // Wipe previously-generated growth placeholders so this is idempotent.
  await Headcount.deleteMany({ scenarioId: scenarioOid, isGrowth: true });

  // Reference point: today's actual headcount + the scenario's CPI/super/
  // average salary. We use the average over real staff (isGrowth != true)
  // for the placeholder salary so the cost line stays believable.
  //
  // A single person can have multiple phase rows (e.g. a salary bump split
  // into Jan–Jul and Aug–onwards). Dedupe by (personName + role +
  // accountCode) so headcount counts distinct people, and keep the LATEST
  // phase per person for the salary average — that's what they'll be on
  // when growth hires arrive in later years.
  type StaffPhaseLean = {
    personName?: string;
    role: string;
    accountCode: string;
    startPeriodKey: string;
    salaryAnnual: { toString: () => string };
    superPct: { toString: () => string };
    onCostPct: { toString: () => string };
    salaryGrowthPctAnnual: { toString: () => string };
    ftePct: { toString: () => string };
  };
  const allRealPhases = await Headcount.find({
    scenarioId: scenarioOid,
    isGrowth: { $ne: true },
  })
    .select(
      "personName role accountCode startPeriodKey salaryAnnual superPct onCostPct salaryGrowthPctAnnual ftePct",
    )
    .lean<StaffPhaseLean[]>();

  // Pick one row per person — the latest phase by startPeriodKey. Anonymous
  // rows (no personName) each count as their own person.
  const latestByPerson = new Map<string, StaffPhaseLean>();
  for (const r of allRealPhases) {
    const key = r.personName
      ? `${r.personName}|${r.role}|${r.accountCode}`
      : `__anon|${Math.random()}`;
    const existing = latestByPerson.get(key);
    if (!existing || r.startPeriodKey.localeCompare(existing.startPeriodKey) > 0) {
      latestByPerson.set(key, r);
    }
  }
  const realStaff = Array.from(latestByPerson.values());
  const currentHeadcount = realStaff.length;
  const avg = (key: keyof StaffPhaseLean, fallback: number): number => {
    if (realStaff.length === 0) return fallback;
    let sum = 0;
    for (const r of realStaff) sum += Number((r[key] as { toString: () => string }).toString());
    return sum / realStaff.length;
  };
  const avgSalary = avg("salaryAnnual", 200_000);
  const avgSuper = avg("superPct", 12);
  const avgOnCost = avg("onCostPct", 15);
  const avgCpi = avg("salaryGrowthPctAnnual", 3);

  // Need the scenario horizon start to convert year index → period key.
  const scen = await Scenario.findById(scenarioOid)
    .select("firstYearLabel")
    .lean<{ firstYearLabel?: number }>();
  const firstYearLabel = scen?.firstYearLabel ?? 2026;
  // Forecast year i (0-indexed) starts at firstYearLabel + i, January (CY).
  const startKeyForYear = (i: number) => `${firstYearLabel + i}-01` as const;

  // Walk targets in order. Running total starts at today's real headcount.
  // Each year's delta = max(0, targets[i] - running). We don't shrink staff.
  const docsToCreate: Record<string, unknown>[] = [];
  let running = currentHeadcount;
  for (let yearIdx = 0; yearIdx < cleanTargets.length; yearIdx += 1) {
    const target = cleanTargets[yearIdx];
    const delta = Math.max(0, target - running);
    if (delta === 0) continue;
    const startPeriodKey = startKeyForYear(yearIdx);
    for (let k = 1; k <= delta; k += 1) {
      docsToCreate.push({
        scenarioId: scenarioOid,
        personName: undefined,
        role: `Growth hire #${k} — CY${String(firstYearLabel + yearIdx).slice(-2)}`,
        accountCode: "6000",
        employmentType: "full_time",
        ftePct: toDecimal128("1"),
        startPeriodKey,
        salaryAnnual: toDecimal128(avgSalary.toFixed(2)),
        superPct: toDecimal128(avgSuper.toFixed(2)),
        onCostPct: toDecimal128(avgOnCost.toFixed(2)),
        salaryGrowthPctAnnual: toDecimal128(avgCpi.toFixed(2)),
        isGrowth: true,
      });
    }
    running = target;
  }

  if (docsToCreate.length > 0) {
    await Headcount.insertMany(docsToCreate);
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteStaff(scenarioId: string, headcountId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(headcountId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Headcount.deleteOne({ _id: headcountId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── AI-powered seeding (requires ANTHROPIC_API_KEY) ─────────────────────────

export interface SeedResult {
  ok: boolean;
  error?: string;
  created?: number;
}

function persistSeededPrograms(scenarioId: string, programs: SeedProgram[]): Promise<unknown> {
  const docs = programs.map((p) => ({
    scenarioId: new Types.ObjectId(scenarioId),
    name: p.name,
    type: p.type,
    dealSize: toDecimal128(p.dealSize),
    faceValuePerNote: toDecimal128(p.faceValuePerNote),
    startPeriodKey: p.startPeriodKey,
    endPeriodKey: p.endPeriodKey,
    notes: p.notes,
    fees: p.fees.map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: toDecimal128(f.basisAmount),
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
    liabilities: p.liabilities.map((l) => ({
      name: l.name,
      numNotes: l.numNotes,
      returnProfileBps: l.returnProfileBps,
      calculationMethod: l.calculationMethod,
      rateType: l.rateType,
      accountCode: l.accountCode ?? "6800",
    })),
    upfrontFees: (p.upfrontFees ?? []).map((u) => ({
      name: u.name,
      category: u.category,
      amount: toDecimal128(u.amount),
      accountCode: u.accountCode,
    })),
  }));
  return CapitalProgram.insertMany(docs);
}

/**
 * If the given scenario is the Gallantree base, clone the same seeded programs
 * into the ALL base so both profiles stay in sync without a second AI call.
 * Best-effort — silently no-ops if the scenario isn't the Gallantree base, no
 * ALL base exists, or any step fails.
 */
async function mirrorProgramsToAllBase(
  gallantreeScenarioId: string,
  programs: SeedProgram[],
): Promise<void> {
  try {
    const thisSc = await Scenario.findById(gallantreeScenarioId)
      .select("isBase viewMode")
      .lean<{ isBase?: boolean; viewMode?: string }>();
    if (!thisSc?.isBase || thisSc.viewMode !== "gallantree") return;

    const allBase = await Scenario.findOne({ isBase: true, viewMode: "all" })
      .select("_id")
      .lean<{ _id: { toString: () => string } }>();
    if (!allBase) return;

    const allBaseId = allBase._id.toString();
    if (allBaseId === gallantreeScenarioId) return;

    await persistSeededPrograms(allBaseId, programs);
    revalidatePath(`/scenarios/${allBaseId}`);
  } catch {
    // Mirror is best-effort.
  }
}

/**
 * If the given scenario is the Gallantree base, clone the seeded loan docs
 * into the ALL base, remapping capitalProgramId by program name. Best-effort.
 */
async function mirrorLoansToAllBase(
  gallantreeScenarioId: string,
  loanDocs: Array<Record<string, unknown>>,
): Promise<void> {
  try {
    if (loanDocs.length === 0) return;

    const thisSc = await Scenario.findById(gallantreeScenarioId)
      .select("isBase viewMode")
      .lean<{ isBase?: boolean; viewMode?: string }>();
    if (!thisSc?.isBase || thisSc.viewMode !== "gallantree") return;

    const allBase = await Scenario.findOne({ isBase: true, viewMode: "all" })
      .select("_id")
      .lean<{ _id: { toString: () => string } }>();
    if (!allBase) return;

    const allBaseId = allBase._id.toString();
    if (allBaseId === gallantreeScenarioId) return;

    const allBaseOid = new Types.ObjectId(allBaseId);

    // Collect unique Gallantree capitalProgramIds referenced in these docs.
    const galProgramOids = new Map<string, Types.ObjectId>();
    for (const d of loanDocs) {
      const oid = d.capitalProgramId as Types.ObjectId | undefined;
      if (oid instanceof Types.ObjectId) galProgramOids.set(oid.toString(), oid);
    }

    // Build gallantreeProgramId → allBaseProgramId mapping via name match.
    const programIdMap = new Map<string, Types.ObjectId>();
    if (galProgramOids.size > 0) {
      const galPrograms = await CapitalProgram.find({
        _id: { $in: Array.from(galProgramOids.values()) },
        scenarioId: gallantreeScenarioId,
      })
        .select("_id name")
        .lean<Array<{ _id: { toString: () => string }; name: string }>>();

      const allPrograms = await CapitalProgram.find({
        scenarioId: allBaseOid,
        name: { $in: galPrograms.map((p) => p.name) },
      })
        .select("_id name")
        .lean<Array<{ _id: { toString: () => string }; name: string }>>();

      const allByName = new Map(
        allPrograms.map((p) => [p.name, new Types.ObjectId(p._id.toString())]),
      );
      for (const gp of galPrograms) {
        const allOid = allByName.get(gp.name);
        if (allOid) programIdMap.set(gp._id.toString(), allOid);
      }
    }

    // Clone loan docs: swap scenarioId and remap capitalProgramId.
    const cloned = loanDocs
      .map((d) => {
        const galProgOid = d.capitalProgramId as Types.ObjectId | undefined;
        const galProgId = galProgOid instanceof Types.ObjectId ? galProgOid.toString() : undefined;
        const allProgOid = galProgId ? programIdMap.get(galProgId) : undefined;
        if (galProgId && !allProgOid) return null; // no matching ALL program — skip
        return { ...d, scenarioId: allBaseOid, capitalProgramId: allProgOid };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (cloned.length > 0) {
      await Loan.insertMany(cloned, { ordered: false }).catch(() => {});
      revalidatePath(`/scenarios/${allBaseId}`);
    }
  } catch {
    // Mirror is best-effort.
  }
}

export async function seedCreCloPrograms(
  scenarioId: string,
  userMessageOverride?: string,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    const { programs } = await generateStructured({
      systemPrompt: CRE_CLO_SEED.systemPrompt,
      tool: CRE_CLO_SEED.tool,
      userMessage: userMessageOverride ?? CRE_CLO_SEED.userMessage,
      maxTokens: 16000,
    });
    await connectToDatabase();
    await persistSeededPrograms(scenarioId, programs);
    await mirrorProgramsToAllBase(scenarioId, programs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: programs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function seedCmbsPrograms(
  scenarioId: string,
  userMessageOverride?: string,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    const { programs } = await generateStructured({
      systemPrompt: CMBS_SEED.systemPrompt,
      tool: CMBS_SEED.tool,
      userMessage: userMessageOverride ?? CMBS_SEED.userMessage,
      maxTokens: 24000,
    });
    await connectToDatabase();
    await persistSeededPrograms(scenarioId, programs);
    await mirrorProgramsToAllBase(scenarioId, programs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: programs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function seedBslPrograms(
  scenarioId: string,
  userMessageOverride?: string,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    const { programs } = await generateStructured({
      systemPrompt: BSL_SEED.systemPrompt,
      tool: BSL_SEED.tool,
      userMessage: userMessageOverride ?? BSL_SEED.userMessage,
      maxTokens: 16000,
    });
    await connectToDatabase();
    await persistSeededPrograms(scenarioId, programs);
    await mirrorProgramsToAllBase(scenarioId, programs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: programs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Seed the current Gallantree team (gallantree.com.au/team) as Headcount
 * rows on a scenario. Deterministic — no AI call. All 17 staff get two
 * rows:
 *
 *   • Phase 1 (current salary, off-grid) — Jan 2026 → Jul 2026
 *   • Phase 2 (bumped salary, on-grid)  — Aug 2026 → ongoing
 *
 * Phase 2's band = max(1, phase1.band − bumpBands), same tier; salary
 * hydrates from the payband grid. Advisors (Cissy Ma, Ivan Ritossa,
 * Steve Toomey) are intentionally excluded.
 *
 * bumpBands defaults to 2 (preserves the original "two paybands up"
 * behaviour). Pass any positive integer to vary the jump; 0 keeps everyone
 * on their current pin (single phase, no bump).
 */
export async function seedGallantreeStaff(
  scenarioId: string,
  options?: { bumpBands?: number },
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  const bumpBands = Math.max(0, Math.floor(options?.bumpBands ?? 2));
  try {
    await connectToDatabase();

    const scen = await Scenario.findById(scenarioId).select("defaultCpiPct defaultSuperPct").lean<{
      defaultCpiPct?: { toString: () => string };
      defaultSuperPct?: { toString: () => string };
    }>();
    const cpi = scen?.defaultCpiPct?.toString() ?? "0";
    const superPct = scen?.defaultSuperPct?.toString() ?? "12";

    // Compute the on-grid (band, tier) pairs we'll need to hydrate salaries
    // for. Always need every person's current pin; need the bumped pin only
    // when bumpBands > 0.
    const bandTiers: Array<{ band: number; tier: number }> = [];
    for (const s of GALLANTREE_STAFF_SEED) {
      bandTiers.push({ band: s.currentBand, tier: s.currentTier });
      if (bumpBands > 0) {
        bandTiers.push({ band: Math.max(1, s.currentBand - bumpBands), tier: s.currentTier });
      }
    }
    const paybands = bandTiers.length
      ? await Payband.find({ $or: bandTiers }).lean<
          Array<{ band: number; tier: number; salaryAnnual?: { toString: () => string } }>
        >()
      : [];
    const pbByKey = new Map<string, string | undefined>();
    for (const p of paybands) pbByKey.set(`${p.band}-${p.tier}`, p.salaryAnnual?.toString());

    const scenarioOid = new Types.ObjectId(scenarioId);
    const docs: Record<string, unknown>[] = [];

    for (const s of GALLANTREE_STAFF_SEED) {
      const common = {
        scenarioId: scenarioOid,
        personName: s.personName,
        role: s.role,
        accountCode: s.accountCode ?? "6000",
        employmentType: s.employmentType ?? "full_time",
        ftePct: toDecimal128("1"),
        superPct: toDecimal128(superPct),
        onCostPct: toDecimal128("20"),
        salaryGrowthPctAnnual: toDecimal128(cpi),
      };

      if (bumpBands === 0) {
        // No bump — single row carrying current salary, running open-ended.
        docs.push({
          ...common,
          band: s.currentBand,
          tier: s.currentTier,
          startPeriodKey: STAFF_PHASE_1_START_PERIOD_KEY,
          salaryAnnual: toDecimal128(String(s.currentSalary)),
        });
        continue;
      }

      // Phase 1 — current pin + actual salary, Jan → Jul 2026.
      docs.push({
        ...common,
        band: s.currentBand,
        tier: s.currentTier,
        startPeriodKey: STAFF_PHASE_1_START_PERIOD_KEY,
        endPeriodKey: STAFF_BUMP_PRECEDING_PERIOD_KEY,
        salaryAnnual: toDecimal128(String(s.currentSalary)),
      });

      // Phase 2 — bumped band/tier, grid salary, Aug 2026 → ongoing.
      const newBand = Math.max(1, s.currentBand - bumpBands);
      const newTier = s.currentTier;
      const gridSalary = pbByKey.get(`${newBand}-${newTier}`);
      docs.push({
        ...common,
        band: newBand,
        tier: newTier,
        startPeriodKey: STAFF_BUMP_START_PERIOD_KEY,
        salaryAnnual: toDecimal128(gridSalary ?? "0"),
      });
    }

    await Headcount.insertMany(docs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: docs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Seed Gallantree's recurring OPEX drivers (rent, utilities, insurance,
 * software, hosting, AI, travel, etc.) onto a scenario. Deterministic — no
 * AI call. Each item in GALLANTREE_OPEX_SEED becomes one Driver document.
 */
export async function seedGallantreeOpex(scenarioId: string): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  try {
    await connectToDatabase();
    const scenarioOid = new Types.ObjectId(scenarioId);
    const docs = GALLANTREE_OPEX_SEED.map((d) => ({
      scenarioId: scenarioOid,
      name: d.name,
      accountCode: d.accountCode,
      type: d.type,
      startPeriodKey: d.startPeriodKey,
      endPeriodKey: d.endPeriodKey,
      ...(d.baseMonthly !== undefined ? { baseMonthly: toDecimal128(String(d.baseMonthly)) } : {}),
      ...(d.monthlyGrowthPct !== undefined
        ? { monthlyGrowthPct: toDecimal128(String(d.monthlyGrowthPct)) }
        : {}),
      ...(d.costPerFteMonthly !== undefined
        ? { costPerFteMonthly: toDecimal128(String(d.costPerFteMonthly)) }
        : {}),
      ...(d.amount !== undefined ? { amount: toDecimal128(String(d.amount)) } : {}),
      ...(d.periodKey !== undefined ? { periodKey: d.periodKey } : {}),
    }));
    await Driver.insertMany(docs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: docs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Seed the two Gallantree Enhanced Income Funds as MIT_FUND programs.
 * Deterministic — no AI call. At seed time, the captiveEquityHoldings
 * field on each fund is populated with every "Equity" tranche currently
 * present on other CMBS / CRE CLO / BSL programs in the scenario. The
 * user can adjust those selections via the holdings selector on the
 * program card.
 */
export async function seedEnhancedIncomeFunds(
  scenarioId: string,
  // userMessageOverride unused for this deterministic seed, but kept for
  // consistency with the other seed functions so the route dispatch can call
  // them all with the same signature.
  _userMessageOverride?: string,
  configRows?: Array<{
    name: string;
    dealSize: string;
    startPeriodKey: string;
    endPeriodKey: string;
  }>,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  try {
    await connectToDatabase();
    const scenarioOid = new Types.ObjectId(scenarioId);

    // Find all existing programs with an "Equity" tranche. Match the
    // tranche name case-insensitively so "Equity tranche", "Equity", etc.
    // all qualify.
    type ProgramRef = {
      _id: { toString: () => string };
      type: string;
      liabilities?: Array<{ name: string }>;
    };
    const existing = await CapitalProgram.find({ scenarioId: scenarioOid })
      .select("_id type liabilities")
      .lean<ProgramRef[]>();
    const equityHoldings: Array<{ programId: Types.ObjectId; trancheName: string }> = [];
    for (const p of existing) {
      // Don't recurse into MIT_FUND or OTHER — equity tranches live on
      // securitisations (CMBS / CRE_CLO / BSL=OTHER → we still want BSL,
      // so allow OTHER too) and not on funds themselves.
      if (p.type === "MIT_FUND") continue;
      for (const l of p.liabilities ?? []) {
        if (/equity/i.test(l.name)) {
          equityHoldings.push({
            programId: new Types.ObjectId(p._id.toString()),
            trancheName: l.name,
          });
        }
      }
    }

    // Build fund specs: use configRows when provided, otherwise fall back to
    // the hard-coded GALLANTREE_ENHANCED_FUNDS defaults.
    const fundSpecs =
      configRows && configRows.length > 0
        ? configRows.map((r) => ({
            name: r.name,
            dealSize: Number(r.dealSize),
            startPeriodKey: r.startPeriodKey,
            endPeriodKey: r.endPeriodKey,
          }))
        : GALLANTREE_ENHANCED_FUNDS.map((f) => ({
            name: f.name,
            dealSize: f.dealSize,
            startPeriodKey: f.startPeriodKey,
            endPeriodKey: `${Number(f.startPeriodKey.slice(0, 4)) + f.termYears}-${f.startPeriodKey.slice(5)}`,
          }));

    const docs = fundSpecs.map((f) => ({
      scenarioId: scenarioOid,
      name: f.name,
      type: "MIT_FUND" as const,
      dealSize: toDecimal128(String(f.dealSize)),
      faceValuePerNote: toDecimal128("1000"),
      startPeriodKey: f.startPeriodKey,
      endPeriodKey: f.endPeriodKey,
      notes:
        GALLANTREE_ENHANCED_FUNDS.find((d) => d.name === f.name)?.notes ??
        "MIS — captive vehicle holding equity tranches of Gallantree securitisations.",
      fees: [
        {
          name: "Senior management fee",
          category: "senior_mgmt" as const,
          basisAmount: toDecimal128(String(f.dealSize)),
          feeBps: ENHANCED_FUND_MGMT_FEE_BPS,
          accountCode: "4500",
        },
      ],
      liabilities: [
        {
          name: "Units (BBSW + 700)",
          numNotes: Math.round(f.dealSize / 1000),
          returnProfileBps: ENHANCED_FUND_UNIT_RETURN_BPS,
          calculationMethod: "monthly" as const,
          rateType: "variable" as const,
          accountCode: "6800",
        },
      ],
      upfrontFees: [],
      captiveEquityHoldings: equityHoldings,
    }));

    await CapitalProgram.insertMany(docs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: docs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function seedWarehousePrograms(
  scenarioId: string,
  userMessageOverride?: string,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    const { programs } = await generateStructured({
      systemPrompt: WAREHOUSE_SEED.systemPrompt,
      tool: WAREHOUSE_SEED.tool,
      userMessage: userMessageOverride ?? WAREHOUSE_SEED.userMessage,
      maxTokens: 8000,
    });
    await connectToDatabase();
    await persistSeededPrograms(scenarioId, programs);
    await mirrorProgramsToAllBase(scenarioId, programs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: programs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function seedLoanBook(scenarioId: string): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  try {
    await connectToDatabase();
    const programs = await CapitalProgram.find({ scenarioId })
      .select("_id name type")
      .lean<Array<{ _id: { toString: () => string }; name: string; type: string }>>();
    if (programs.length === 0) {
      return {
        ok: false,
        error: "No capital programs found. Seed CRE CLO + CMBS programs first.",
      };
    }
    const progRefs = programs.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      type: p.type as "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER",
    }));
    const { loans } = await generateStructured({
      systemPrompt: LOAN_BOOK_SEED.systemPrompt,
      tool: LOAN_BOOK_SEED.tool,
      userMessage: LOAN_BOOK_SEED.buildUserMessage(progRefs),
      maxTokens: 60000,
    });

    // Validate program IDs Claude assigned and persist.
    const validIds = new Set(progRefs.map((p) => p.id));
    const docs = loans
      .filter((l: SeedLoan) => validIds.has(l.capitalProgramId))
      .map((l: SeedLoan) => {
        const [y, m] = l.originationPeriod.split("-").map(Number);
        const origination = new Date(Date.UTC(y, m - 1, 1));
        const maturity = new Date(Date.UTC(y, m - 1 + l.termMonths, 1));
        return {
          scenarioId: new Types.ObjectId(scenarioId),
          capitalProgramId: new Types.ObjectId(l.capitalProgramId),
          loanId: l.loanId,
          borrower: l.borrower,
          state: l.state,
          assetClass: l.assetClass,
          propertyStatus: l.propertyStatus,
          originationDate: origination,
          maturityDate: maturity,
          termMonths: l.termMonths,
          balance: toDecimal128(l.balance),
          lvr: toDecimal128(l.lvr),
          dscr: toDecimal128(l.dscr),
          internalScore: l.internalScore,
          internalGrade: l.internalGrade,
          creditSpreadBps: l.creditSpreadBps,
          includeInRevenue: true,
        };
      });
    if (docs.length === 0) {
      return { ok: false, error: "Claude returned no valid loans" };
    }
    await Loan.insertMany(docs, { ordered: false });
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: docs.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Per-FY loan seeding (parameterized modal) ───────────────────────────────

// Calendar year → list of YYYY-MM keys (Jan through Dec).
function monthsForFy(fy: number): string[] {
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) {
    months.push(`${fy}-${String(m).padStart(2, "0")}`);
  }
  return months;
}

// Map Gallantree internal grade → indicative agency ratings.
function indicativeRatings(grade: string): { fitch: string; moodys: string } {
  switch (grade) {
    case "A+":
      return { fitch: "AAAsf", moodys: "Aaa(sf)" };
    case "A":
      return { fitch: "AAsf", moodys: "Aa(sf)" };
    case "A-":
      return { fitch: "Asf", moodys: "A(sf)" };
    case "B+":
      return { fitch: "BBBsf", moodys: "Baa(sf)" };
    case "B":
      return { fitch: "BBBsf", moodys: "Baa(sf)" };
    case "B-":
      return { fitch: "BBsf", moodys: "Ba(sf)" };
    case "C+":
      return { fitch: "BBsf", moodys: "Ba(sf)" };
    case "C":
      return { fitch: "Bsf", moodys: "B(sf)" };
    case "C-":
      return { fitch: "Bsf", moodys: "B(sf)" };
    case "D+":
    case "D":
    case "D-":
      return { fitch: "Bsf", moodys: "B(sf)" };
    default:
      return { fitch: "NR", moodys: "NR" };
  }
}

export interface SeedLoansByFyParams {
  style: LoanStyle;
  // One assignment per FY — count + the program loans in that FY will be
  // booked into. Different FYs can target different programs so a multi-year
  // seed naturally spreads across the CRE CLO / CMBS pipeline.
  fyAssignments: Array<{
    fy: number;
    count: number;
    capitalProgramId: string;
    // 1 = very low risk, 5 = very high risk. Defaults to 3 (neutral) when
    // omitted so older callers keep working.
    riskLevel?: 1 | 2 | 3 | 4 | 5;
  }>;
}

export async function seedLoansByFy(
  scenarioId: string,
  params: SeedLoansByFyParams,
): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };
  if (!isAnthropicConfigured()) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };

  // Validate every program ID up front.
  for (const a of params.fyAssignments) {
    if (a.count > 0 && !Types.ObjectId.isValid(a.capitalProgramId)) {
      return { ok: false, error: `invalid capital program for FY${a.fy}` };
    }
  }

  try {
    await connectToDatabase();

    // Bulk-load all referenced programs once, keyed by id.
    const uniqueProgramIds = Array.from(
      new Set(params.fyAssignments.filter((a) => a.count > 0).map((a) => a.capitalProgramId)),
    );
    if (uniqueProgramIds.length === 0) {
      return { ok: false, error: "no FY has a positive count" };
    }
    const programDocs = await CapitalProgram.find({
      _id: { $in: uniqueProgramIds.map((id) => new Types.ObjectId(id)) },
      scenarioId,
    })
      .select("name type arrearsPctTarget")
      .lean<
        Array<{
          _id: { toString: () => string };
          name: string;
          type: string;
          arrearsPctTarget?: { toString: () => string };
        }>
      >();
    const programById = new Map(programDocs.map((p) => [p._id.toString(), p]));
    if (programById.size !== uniqueProgramIds.length) {
      return {
        ok: false,
        error: "one or more selected programs not found in this scenario",
      };
    }

    // Scenario base rate (BBSW) for derived all-in fields.
    const scen = await Scenario.findById(scenarioId)
      .select("baseRateBps")
      .lean<{ baseRateBps?: number }>();
    const bbswBps = scen?.baseRateBps ?? 420;

    const scenarioOid = new Types.ObjectId(scenarioId);

    // Per-slice worker: one AI call + doc composition. Returns the Loan
    // documents ready to insertMany. Kept side-effect-free so we can run
    // many in parallel without races. Logs upstream errors as a return
    // value instead of throwing — one bad slice shouldn't sink the rest.
    async function seedSlice(assignment: {
      fy: number;
      count: number;
      capitalProgramId: string;
      riskLevel?: 1 | 2 | 3 | 4 | 5;
    }): Promise<Array<Record<string, unknown>>> {
      const { fy, count, capitalProgramId, riskLevel } = assignment;
      if (!Number.isFinite(count) || count <= 0) return [];
      const program = programById.get(capitalProgramId);
      if (!program) return [];
      const cappedCount = Math.min(Math.floor(count), 300); // single-call ceiling
      const monthKeys = monthsForFy(fy);

      const { loans } = await generateStructured({
        systemPrompt: FY_LOANS_SEED.systemPrompt,
        tool: FY_LOANS_SEED.tool,
        userMessage: FY_LOANS_SEED.buildUserMessage({
          fy,
          count: cappedCount,
          style: params.style,
          programName: program.name,
          monthKeys,
          riskLevel,
        }),
        maxTokens: 60000,
      });

      const programOid = new Types.ObjectId(capitalProgramId);

      // Per-program arrears target — what % of THIS program's loans should
      // be in some arrears bucket. Default 3% if the program doesn't have
      // a configured target. Allocation across the four arrears buckets
      // is biased toward the lighter end (mostly 30-day) since healthier
      // portfolios bunch closer to current. Index N is the cumulative
      // share that lands at or before this bucket.
      const arrearsRate = program.arrearsPctTarget
        ? Math.max(0, Math.min(1, Number(program.arrearsPctTarget.toString())))
        : 0.03;
      // Within the in-arrears slice, 50% 30-day, 25% 60-day, 15% 90-day, 10% default.
      const arrearsMixCdf = [0.5, 0.75, 0.9, 1.0];
      const arrearsMixLabels: Array<"arrears30" | "arrears60" | "arrears90" | "default"> = [
        "arrears30",
        "arrears60",
        "arrears90",
        "default",
      ];

      // Compose full Loan documents — code fills every remaining field so
      // nothing in the schema is blank.
      return loans.map((l: FySeedLoanRow) => {
        const [oy, om] = l.originationPeriod.split("-").map(Number);
        const origination = new Date(Date.UTC(oy, om - 1, 1));
        const maturity = new Date(Date.UTC(oy, om - 1 + l.termMonths, 1));
        const balance = Number(l.balance);
        const lvr = Number(l.lvr);
        const dscr = Number(l.dscr);
        const allInBps = bbswBps + l.creditSpreadBps;
        const allInPct = allInBps / 10000;
        const annualInterest = balance * allInPct;
        const propertyValue = lvr > 0 ? balance / lvr : balance;
        // NOI / NCF / ICR derived from DSCR (annual debt service ≈ annual interest for IO loans).
        const noi = dscr * annualInterest;
        const ncf = noi * 0.95;
        const icr = annualInterest > 0 ? noi / annualInterest : dscr;
        // WALE: weighted-avg lease expiry, in years. Stabilised: 3-7y; Transitional: 1-3y.
        const isStabilised = l.propertyStatus === "Stabilised";
        const waleYears = isStabilised ? 3 + Math.random() * 4 : 1 + Math.random() * 2;
        const { fitch, moodys } = indicativeRatings(l.internalGrade);

        // Arrears assignment: roll once per loan against the program's
        // arrears target. If the loan goes into arrears, pick a bucket
        // from the cumulative mix (mostly 30-day, tail to default).
        let arrearsStatus: ArrearsStatus = "current";
        if (Math.random() < arrearsRate) {
          const r = Math.random();
          const idx = arrearsMixCdf.findIndex((c) => r <= c);
          arrearsStatus = arrearsMixLabels[idx === -1 ? 0 : idx];
        }

        return {
          scenarioId: scenarioOid,
          capitalProgramId: programOid,
          loanId: l.loanId,
          borrower: l.borrower,
          lenderOfRecord: "Gallantree Capital Pty Ltd",
          state: l.state,
          postcode: l.postcode,
          assetClass: l.assetClass,
          propertyStatus: l.propertyStatus,
          location: l.location,
          originationDate: origination,
          maturityDate: maturity,
          termMonths: l.termMonths,
          balance: toDecimal128(balance.toFixed(2)),
          propertyValue: toDecimal128(propertyValue.toFixed(2)),
          lvr: toDecimal128(lvr.toFixed(4)),
          noi: toDecimal128(noi.toFixed(2)),
          ncf: toDecimal128(ncf.toFixed(2)),
          icr: toDecimal128(icr.toFixed(2)),
          dscr: toDecimal128(dscr.toFixed(2)),
          wale: toDecimal128(waleYears.toFixed(2)),
          internalScore: l.internalScore,
          internalGrade: l.internalGrade,
          fitchIndicative: fitch,
          moodysIndicative: moodys,
          binding: "Negotiated",
          creditSpreadBps: l.creditSpreadBps,
          marginBps: l.creditSpreadBps,
          bbsw1mBps: bbswBps,
          allInBps,
          allInPct: toDecimal128(allInPct.toFixed(6)),
          annualInterest: toDecimal128(annualInterest.toFixed(2)),
          includeInRevenue: true,
          arrearsStatus,
        };
      });
    }

    // Run AI slices in parallel. Heroku's router kills any single request
    // that doesn't return within 30s, so we need total wall-clock =
    // ceil(slices / concurrency) × max(slice_latency) < 30s. Setting
    // concurrency = 25 lets a typical seed (≤25 slices) fire every slice
    // in parallel — total drops to ~max(slice). Anthropic's Haiku per-key
    // burst caps comfortably tolerate this.
    const SLICE_CONCURRENCY = 25;
    const allDocs: Array<Record<string, unknown>> = [];
    for (let i = 0; i < params.fyAssignments.length; i += SLICE_CONCURRENCY) {
      const batch = params.fyAssignments.slice(i, i + SLICE_CONCURRENCY);
      const results = await Promise.all(batch.map(seedSlice));
      for (const docs of results) allDocs.push(...docs);
    }

    // ── Deduplicate loanIds ─────────────────────────────────────────────
    // The AI emits loanIds like LOAN-27-0001..0NNN inside each slice. With
    // multiple slices per FY (one per program) all starting at 0001, the
    // unique index { scenarioId, loanId } silently drops the collisions
    // and we end up with fewer rows than requested. Re-stamp every loanId
    // with a per-run nonce + global per-FY sequence so insertMany never
    // collides — within this run, or against pre-existing seeds in the
    // same scenario.
    const runNonce = Date.now().toString(36).slice(-3).toUpperCase();
    const fyCounters = new Map<string, number>();
    for (const doc of allDocs) {
      const od = doc.originationDate as Date;
      const m = od.getUTCMonth() + 1;
      const y = od.getUTCFullYear();
      const fy2 = String(m >= 7 ? y + 1 : y).slice(-2);
      const next = (fyCounters.get(fy2) ?? 0) + 1;
      fyCounters.set(fy2, next);
      doc.loanId = `LOAN-${fy2}-${runNonce}-${String(next).padStart(4, "0")}`;
    }

    // ── Bulk insert and surface the real created count ─────────────────
    // insertMany with ordered:false continues past duplicate-key errors
    // but throws a BulkWriteError carrying insertedCount. We catch it so
    // the caller learns how many rows actually landed (vs the optimistic
    // allDocs.length we used to return).
    let createdCount = 0;
    if (allDocs.length > 0) {
      try {
        const inserted = await Loan.insertMany(allDocs, { ordered: false });
        createdCount = inserted.length;
      } catch (e) {
        // Mongoose forwards driver BulkWriteError with insertedDocs[].
        const err = e as { insertedDocs?: unknown[]; message?: string };
        if (Array.isArray(err.insertedDocs)) {
          createdCount = err.insertedDocs.length;
        } else {
          throw e;
        }
      }
    }
    await mirrorLoansToAllBase(scenarioId, allDocs);
    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: createdCount };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Capital Raises ──────────────────────────────────────────────────────────
// Each raise is a top-level document with embedded investors. Mirrors the
// CapitalProgram/embedded-children pattern. Investor commitments flow into
// cashflow on the funding date — equity into equity, convertibles into
// notes payable. No P&L impact (cash-only model).

export type CapitalRaiseType = "equity" | "convertible_note";
export type InvestorStatus = "committed" | "funded" | "withdrawn";

export type InvestorPayload = {
  name: string;
  commitment: string;
  fundingDate: string; // YYYY-MM-DD
  numNotes?: number;
  status: InvestorStatus;
  notes?: string;
};

export type CapitalRaisePayload = {
  name: string;
  type: CapitalRaiseType;
  raiseDate: string; // YYYY-MM-DD
  targetSize: string;
  discountPct?: string; // fraction (0.20 = 20%)
  valuationCap?: string;
  pricePerUnit?: string;
};

const RAISE_TYPES = new Set(["equity", "convertible_note"]);
const INVESTOR_STATUSES = new Set(["committed", "funded", "withdrawn"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(s: string): Date | null {
  if (!DATE_RE.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createCapitalRaise(
  scenarioId: string,
  payload: CapitalRaisePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !RAISE_TYPES.has(payload.type)) return;
  const raiseDate = parseDate(payload.raiseDate);
  if (!raiseDate) return;
  if (!/^-?\d+(\.\d+)?$/.test(parseDecimalInput(payload.targetSize))) return;

  await connectToDatabase();
  await CapitalRaise.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name: payload.name.trim(),
    type: payload.type,
    raiseDate,
    targetSize: toDecimal128(payload.targetSize),
    discountPct: payload.discountPct ? toDecimal128(payload.discountPct) : undefined,
    valuationCap: payload.valuationCap ? toDecimal128(payload.valuationCap) : undefined,
    pricePerUnit: payload.pricePerUnit ? toDecimal128(payload.pricePerUnit) : undefined,
    investors: [],
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateCapitalRaise(
  scenarioId: string,
  raiseId: string,
  payload: CapitalRaisePayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(raiseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !RAISE_TYPES.has(payload.type)) return;
  const raiseDate = parseDate(payload.raiseDate);
  if (!raiseDate) return;
  if (!/^-?\d+(\.\d+)?$/.test(parseDecimalInput(payload.targetSize))) return;

  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId },
    {
      $set: {
        name: payload.name.trim(),
        type: payload.type,
        raiseDate,
        targetSize: toDecimal128(payload.targetSize),
        discountPct: payload.discountPct ? toDecimal128(payload.discountPct) : undefined,
        valuationCap: payload.valuationCap ? toDecimal128(payload.valuationCap) : undefined,
        pricePerUnit: payload.pricePerUnit ? toDecimal128(payload.pricePerUnit) : undefined,
      },
      $unset: {
        ...(payload.discountPct ? {} : { discountPct: "" }),
        ...(payload.valuationCap ? {} : { valuationCap: "" }),
        ...(payload.pricePerUnit ? {} : { pricePerUnit: "" }),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteCapitalRaise(scenarioId: string, raiseId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(raiseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await CapitalRaise.deleteOne({ _id: raiseId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

/**
 * Persist the Use-of-Funds plan for a capital raise. Stores the runway
 * window, contingency %, revenue-toggle, and any manual line items. The
 * Use of Funds tab recomputes the underlying staff / OPEX / issuance
 * totals live from the engine — only the dials and ad-hoc rows persist.
 */
export async function saveUseOfFundsPlan(
  scenarioId: string,
  raiseId: string,
  plan: {
    coverMonths: number;
    contingencyPct: number;
    includeRevenue: boolean;
    manualLines: Array<{ label: string; amount: number }>;
  },
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(raiseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const coverMonths = Math.max(1, Math.min(60, Math.floor(plan.coverMonths)));
  const contingencyPct = Math.max(0, Math.min(100, Number(plan.contingencyPct) || 0));
  const includeRevenue = !!plan.includeRevenue;
  const manualLines = plan.manualLines
    .filter((l) => l.label.trim() && Number.isFinite(l.amount))
    .map((l) => ({ label: l.label.trim(), amount: toDecimal128(String(l.amount)) }));
  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId },
    {
      $set: {
        useOfFundsPlan: {
          coverMonths,
          contingencyPct: toDecimal128(String(contingencyPct)),
          includeRevenue,
          manualLines,
        },
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

/**
 * Bulk-flip every "committed" investor on a raise to "funded". Withdrawn
 * rows are untouched. Useful once a round has fully closed.
 */
export async function markAllInvestorsFunded(scenarioId: string, raiseId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(raiseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId },
    { $set: { "investors.$[el].status": "funded" } },
    { arrayFilters: [{ "el.status": "committed" }] },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function addInvestor(
  scenarioId: string,
  raiseId: string,
  payload: InvestorPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(raiseId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim()) return;
  if (!INVESTOR_STATUSES.has(payload.status)) return;
  const fundingDate = parseDate(payload.fundingDate);
  if (!fundingDate) return;
  if (!/^-?\d+(\.\d+)?$/.test(parseDecimalInput(payload.commitment))) return;

  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId },
    {
      $push: {
        investors: {
          name: payload.name.trim(),
          commitment: toDecimal128(payload.commitment),
          fundingDate,
          numNotes: Number.isFinite(payload.numNotes) ? payload.numNotes : undefined,
          status: payload.status,
          notes: payload.notes?.trim() || undefined,
        },
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateInvestor(
  scenarioId: string,
  raiseId: string,
  investorId: string,
  payload: InvestorPayload,
): Promise<void> {
  if (
    !Types.ObjectId.isValid(scenarioId) ||
    !Types.ObjectId.isValid(raiseId) ||
    !Types.ObjectId.isValid(investorId)
  )
    return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !INVESTOR_STATUSES.has(payload.status)) return;
  const fundingDate = parseDate(payload.fundingDate);
  if (!fundingDate) return;
  if (!/^-?\d+(\.\d+)?$/.test(parseDecimalInput(payload.commitment))) return;

  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId, "investors._id": investorId },
    {
      $set: {
        "investors.$.name": payload.name.trim(),
        "investors.$.commitment": toDecimal128(payload.commitment),
        "investors.$.fundingDate": fundingDate,
        "investors.$.numNotes": Number.isFinite(payload.numNotes) ? payload.numNotes : undefined,
        "investors.$.status": payload.status,
        "investors.$.notes": payload.notes?.trim() || undefined,
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteInvestor(
  scenarioId: string,
  raiseId: string,
  investorId: string,
): Promise<void> {
  if (
    !Types.ObjectId.isValid(scenarioId) ||
    !Types.ObjectId.isValid(raiseId) ||
    !Types.ObjectId.isValid(investorId)
  )
    return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await CapitalRaise.updateOne(
    { _id: raiseId, scenarioId },
    { $pull: { investors: { _id: new Types.ObjectId(investorId) } } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── Capital-raise seeds ─────────────────────────────────────────────────────
// One-click seed for the Initial Convertible Note round. Data is the actual
// investor list as of the initial bring-up — 26 commitments, AU$10,000 per
// note. Status mapping:
//   AML/CTF Fail              → withdrawn
//   Payment Received = Yes    → funded
//   otherwise                 → committed
// Multi-tranche commitments (e.g. Bauer's three tranches) are collapsed into
// a single investor row at the original subscription date; tranche details
// are preserved verbatim in the notes field.

type SeedInvestorRow = {
  name: string;
  commitment: number; // AUD
  fundingDate: string; // YYYY-MM-DD
  status: InvestorStatus;
  notes?: string;
};

const INITIAL_CN_NOTE_PRICE = 10000;

const INITIAL_CN_INVESTORS: SeedInvestorRow[] = [
  {
    name: "JAM 2222 LLC",
    commitment: 760000,
    fundingDate: "2025-10-23",
    status: "funded",
    notes:
      "Iovino · Wholesale Family Office. Actual amount converted from US$500,000 was AU$762,645 but only 76 AU$10,000 Notes were issued and recorded as a AU$760,000 investment. When we convert the notes we will note the extra amount and allocate shares commensurately.",
  },
  {
    name: "Frazis Venture Fund",
    commitment: 500000,
    fundingDate: "2024-11-06",
    status: "funded",
    notes:
      "Apex Fund Services Pty Ltd · Wholesale Family Office. Payment Reference when sending interest or dividend payments is GTI41219",
  },
  {
    name: "BauerAR Pty Ltd",
    commitment: 400000,
    fundingDate: "2025-03-19",
    status: "funded",
    notes:
      "Andrew Bauer · Wholesale HNW. $100,000 invested on 19 March 2025; $100,000 invested on 28 August 2025; $200,000 invested on 5 March 2026.",
  },
  {
    name: "Johnsey Pty Ltd",
    commitment: 250000,
    fundingDate: "2024-10-03",
    status: "committed",
    notes: "Keystone Advisors on behalf of the Carleton Family Office · Wholesale Family Office.",
  },
  {
    name: "Madhuri Pty Ltd",
    commitment: 250000,
    fundingDate: "2024-11-07",
    status: "committed",
    notes: "Keystone Advisors on behalf of Alok Patel and his parents · Wholesale HNW.",
  },
  {
    name: "The Carter Family Trust Number 2",
    commitment: 250000,
    fundingDate: "2025-02-24",
    status: "committed",
    notes: "Viernes Pty Ltd · Rob Carter · Wholesale HNW.",
  },
  {
    name: "Jacaranda Finance Pty Ltd",
    commitment: 200000,
    fundingDate: "2024-09-25",
    status: "committed",
    notes: "Daniel Wessels · Sophisticated Fund Manager.",
  },
  {
    name: "Peter Pan Investments",
    commitment: 200000,
    fundingDate: "2025-09-23",
    status: "committed",
    notes:
      "Botteva Pty Ltd · Alistair Ferdinands via Julien Brodie (VP Wealth) · Wholesale Family Office. NOTE: all comms to Netwealth Wealth Accelerator Non-Custodial Investment Service 20Oct25.",
  },
  {
    name: "KSR Trust",
    commitment: 200000,
    fundingDate: "2025-03-04",
    status: "committed",
    notes:
      "Benayeo Investments Pty Ltd · Rob Porter + Tom Porter · Wholesale Family Office. Invested $100,000 4 March 2025; invested $100,000 10 March 2026.",
  },
  {
    name: "Plymouth Trust",
    commitment: 150000,
    fundingDate: "2025-04-16",
    status: "funded",
    notes:
      "Plymouth Nominees Pty Ltd · Simon Toussaint · Sophisticated Family Office. Invested $100,000 on 16 April 2025; invested $50,000 on 13 February 2026.",
  },
  {
    name: "Dale International Trust Company Limited as Trustees of The PBS Trust",
    commitment: 150000,
    fundingDate: "2025-03-26",
    status: "committed",
    notes:
      "David Kay · Wholesale HNW. Invested $100,000 on 26 March 2025; invested $50,000 on 16 February 2026.",
  },
  {
    name: "John Victor Swinson",
    commitment: 150000,
    fundingDate: "2026-02-02",
    status: "funded",
    notes: "Sophisticated HNW.",
  },
  {
    name: "Dale International Trust Company Limited as Trustees of The Pilot Trust",
    commitment: 100000,
    fundingDate: "2025-04-29",
    status: "committed",
    notes: "Robert Currie · Wholesale HNW.",
  },
  {
    name: "Kilmartin Super Pty Ltd ATF Kilmartin Super",
    commitment: 100000,
    fundingDate: "2025-01-06",
    status: "funded",
    notes:
      "Ben Kilmartin · Wholesale HNW. Invested $70,000 on 6 January 2025; invested $30,000 on 20 May 2025.",
  },
  {
    name: "Macarthur Biosciences Pty Ltd ATF Sethi Family Trust No.2",
    commitment: 100000,
    fundingDate: "2025-08-28",
    status: "withdrawn",
    notes: "Sharif Sethi · Wholesale Family Office. AML/CTF Failed.",
  },
  {
    name: "NC Resources Pty Limited ATF CJN Family Trust",
    commitment: 100000,
    fundingDate: "2025-06-27",
    status: "committed",
    notes:
      "Callum Newton · Wholesale HNW. Invested $50,000 on 27 June 2025; invested $50,000 on 28 August 2025.",
  },
  {
    name: "Tre Fratelli Pty Ltd ATF Lincoln SMSF",
    commitment: 80000,
    fundingDate: "2025-02-25",
    status: "committed",
    notes:
      "Tony Conaghan · Wholesale HNW. Invested $50,000 on 25 February 2025; invested $30,000 on 19 October 2025.",
  },
  {
    name: "PNC Horizon Pty Ltd ATF The Higgs Family Trust",
    commitment: 60000,
    fundingDate: "2025-06-17",
    status: "committed",
    notes:
      "Haydn Higgs · Wholesale HNW. Invested $30,000 on 17 June 2025; invested $30,000 on 8 October 2025.",
  },
  {
    name: "KPSF Pty Ltd ATF The Jackson Family Super Fund",
    commitment: 50000,
    fundingDate: "2025-10-02",
    status: "committed",
    notes: "David Jackson · Wholesale Family Office.",
  },
  {
    name: "BKIM Holdings Pty Ltd ATF BK Discretionary Trust",
    commitment: 30000,
    fundingDate: "2025-05-30",
    status: "committed",
    notes: "Ben Kilmartin · Wholesale HNW.",
  },
  {
    name: "H and D Higgs Pty Ltd ATF The Higgs Superannuation Fund",
    commitment: 30000,
    fundingDate: "2025-06-17",
    status: "committed",
    notes: "Haydn Higgs · Wholesale HNW.",
  },
  {
    name: "Faxanadu Pty Ltd ATF Howes Family Investment Trust",
    commitment: 30000,
    fundingDate: "2025-02-07",
    status: "committed",
    notes: "Luke Howes · Wholesale HNW.",
  },
  {
    name: "Tatsiana Bakun",
    commitment: 30000,
    fundingDate: "2025-10-31",
    status: "committed",
    notes: "Wholesale HNW.",
  },
  {
    name: "Krystian Wakiec",
    commitment: 250000,
    fundingDate: "2026-03-24",
    status: "withdrawn",
    notes: "Sophisticated HNW. AML/CTF Failed. 27 Gristock Street Coorparoo, Australia.",
  },
  {
    name: "Andreas Moser",
    commitment: 50000,
    fundingDate: "2026-03-25",
    status: "withdrawn",
    notes: "Sophisticated Family Office. AML/CTF Failed.",
  },
  {
    name: "Christopher John Grogan",
    commitment: 50000,
    fundingDate: "2026-03-24",
    status: "committed",
    notes: "Sophisticated Family Office.",
  },
];

export async function seedInitialConvertibleNote(scenarioId: string): Promise<SeedResult> {
  if (!Types.ObjectId.isValid(scenarioId)) return { ok: false, error: "invalid scenario" };
  if (!(await checkAccess(scenarioId))) return { ok: false, error: "not authorized" };

  try {
    await connectToDatabase();
    const totalCommitted = INITIAL_CN_INVESTORS.reduce((acc, r) => acc + r.commitment, 0);
    const earliestDate = INITIAL_CN_INVESTORS.map((r) => r.fundingDate).sort()[0];

    const raise = await CapitalRaise.create({
      scenarioId: new Types.ObjectId(scenarioId),
      name: "Initial Convertible Note",
      type: "convertible_note",
      raiseDate: new Date(`${earliestDate}T00:00:00Z`),
      targetSize: toDecimal128(String(totalCommitted)),
      pricePerUnit: toDecimal128(String(INITIAL_CN_NOTE_PRICE)),
      investors: INITIAL_CN_INVESTORS.map((r) => ({
        name: r.name,
        commitment: toDecimal128(String(r.commitment)),
        fundingDate: new Date(`${r.fundingDate}T00:00:00Z`),
        numNotes: Math.round(r.commitment / INITIAL_CN_NOTE_PRICE),
        status: r.status,
        notes: r.notes,
      })),
    });

    revalidatePath(`/scenarios/${scenarioId}`);
    return { ok: true, created: raise.investors.length };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function updateOpeningCash(scenarioId: string, value: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const cleaned = parseDecimalInput(value);
  await connectToDatabase();
  await Scenario.updateOne({ _id: scenarioId }, { $set: { openingCash: toDecimal128(cleaned) } });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateWorkingCapitalDays(
  scenarioId: string,
  payload: { dsoDays: string; dpoDays: string },
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  const dso = parseDecimalInput(payload.dsoDays);
  const dpo = parseDecimalInput(payload.dpoDays);
  if (Number(dso) < 0 || Number(dpo) < 0) return;
  await connectToDatabase();
  await Scenario.updateOne(
    { _id: scenarioId },
    { $set: { dsoDays: toDecimal128(dso), dpoDays: toDecimal128(dpo) } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

// ── Chart of accounts sync ──────────────────────────────────────────────────
// Upserts the canonical DEFAULT_COA into the shared Account collection so
// operators don't need to re-run the seed script after a COA change.

export async function syncCoa(scenarioId: string): Promise<{ upserted: number; modified: number }> {
  if (!Types.ObjectId.isValid(scenarioId)) return { upserted: 0, modified: 0 };
  if (!(await checkAccess(scenarioId))) return { upserted: 0, modified: 0 };
  await connectToDatabase();
  const ops = DEFAULT_COA.map((a) => ({
    updateOne: {
      filter: { code: a.code },
      update: { $set: { name: a.name, type: a.type } },
      upsert: true,
    },
  }));
  const result = await Account.bulkWrite(ops);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { upserted: result.upsertedCount, modified: result.modifiedCount };
}

// ── Capital table (shareholders) ────────────────────────────────────────────

export type ShareholderPayload = {
  name: string;
  entityTrust?: string;
  shareClass: string;
  shares: string;
  pricePerShare: string;
  beneficiallyHeld: boolean;
  dateOfIssue: string; // ISO date string YYYY-MM-DD
};

export async function createShareholder(
  scenarioId: string,
  payload: ShareholderPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !payload.shareClass?.trim()) return;
  if (!DATE_RE.test(payload.dateOfIssue)) return;
  const shares = Math.floor(Number(payload.shares));
  if (!Number.isFinite(shares) || shares < 1) return;
  const price = Number(payload.pricePerShare);
  if (!Number.isFinite(price) || price < 0) return;
  await connectToDatabase();
  await Shareholder.create({
    scenarioId: new Types.ObjectId(scenarioId),
    name: payload.name.trim(),
    entityTrust: payload.entityTrust?.trim() || undefined,
    shareClass: payload.shareClass.trim(),
    shares,
    pricePerShare: toDecimal128(payload.pricePerShare),
    beneficiallyHeld: payload.beneficiallyHeld,
    dateOfIssue: new Date(payload.dateOfIssue),
  });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function updateShareholder(
  scenarioId: string,
  shareholderId: string,
  payload: ShareholderPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(shareholderId)) return;
  if (!(await checkAccess(scenarioId))) return;
  if (!payload.name?.trim() || !payload.shareClass?.trim()) return;
  if (!DATE_RE.test(payload.dateOfIssue)) return;
  const shares = Math.floor(Number(payload.shares));
  if (!Number.isFinite(shares) || shares < 1) return;
  const price = Number(payload.pricePerShare);
  if (!Number.isFinite(price) || price < 0) return;
  await connectToDatabase();
  await Shareholder.updateOne(
    { _id: shareholderId, scenarioId },
    {
      $set: {
        name: payload.name.trim(),
        entityTrust: payload.entityTrust?.trim() || undefined,
        shareClass: payload.shareClass.trim(),
        shares,
        pricePerShare: toDecimal128(payload.pricePerShare),
        beneficiallyHeld: payload.beneficiallyHeld,
        dateOfIssue: new Date(payload.dateOfIssue),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteShareholder(scenarioId: string, shareholderId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(shareholderId)) return;
  if (!(await checkAccess(scenarioId))) return;
  await connectToDatabase();
  await Shareholder.deleteOne({ _id: shareholderId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function seedShareholders(scenarioId: string): Promise<{ inserted: number }> {
  if (!Types.ObjectId.isValid(scenarioId)) return { inserted: 0 };
  if (!(await checkAccess(scenarioId))) return { inserted: 0 };
  const { SHAREHOLDER_SEED } = await import("@/seed/shareholders");
  await connectToDatabase();
  const docs = SHAREHOLDER_SEED.map((s) => ({
    scenarioId: new Types.ObjectId(scenarioId),
    name: s.name,
    entityTrust: s.entityTrust,
    shareClass: s.shareClass,
    shares: s.shares,
    pricePerShare: toDecimal128(s.pricePerShare),
    beneficiallyHeld: s.beneficiallyHeld,
    dateOfIssue: new Date(s.dateOfIssue),
  }));
  await Shareholder.insertMany(docs);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { inserted: docs.length };
}

// ── Cap table option pools ────────────────────────────────────────────────────

export async function updateCapTableOptionPools(
  scenarioId: string,
  esopPctByYear: number[],
  earnBackPctByYear: number[],
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
  if (!(await checkAccess(scenarioId))) return;

  await connectToDatabase();

  function cleanPcts(arr: number[]): number[] {
    return arr.map((n) => (Number.isFinite(n) && n >= 0 ? Math.min(100, n) : 0));
  }

  await Scenario.updateOne(
    { _id: new Types.ObjectId(scenarioId) },
    {
      $set: {
        esopPctByYear: cleanPcts(esopPctByYear),
        earnBackPctByYear: cleanPcts(earnBackPctByYear),
      },
    },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}
