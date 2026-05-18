"use server";

import { Types } from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import {
  CapitalProgram,
  Driver,
  Headcount,
  Loan,
  Payband,
  PlatformLicense,
  Scenario,
} from "@/models";
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

export type ProgramLiabilityPayload = {
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: "monthly" | "quarterly" | "annually";
  rateType: "fixed" | "variable";
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
  fees: ProgramFeePayload[];
  liabilities?: ProgramLiabilityPayload[];
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
const LIABILITY_CALC_METHODS = new Set(["monthly", "quarterly", "annually"]);
const LIABILITY_RATE_TYPES = new Set(["fixed", "variable"]);

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
    faceValuePerNote: payload.faceValuePerNote
      ? toDecimal128(payload.faceValuePerNote)
      : undefined,
    startPeriodKey: payload.startPeriodKey,
    endPeriodKey: payload.endPeriodKey,
    notes: payload.notes,
    fees,
    liabilities: sanitiseLiabilities(payload),
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
        faceValuePerNote: payload.faceValuePerNote
          ? toDecimal128(payload.faceValuePerNote)
          : undefined,
        startPeriodKey: payload.startPeriodKey,
        endPeriodKey: payload.endPeriodKey,
        notes: payload.notes,
        fees,
        liabilities: sanitiseLiabilities(payload),
      },
      $unset: {
        ...(payload.dealSize ? {} : { dealSize: "" }),
        ...(payload.faceValuePerNote ? {} : { faceValuePerNote: "" }),
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

export type ValuationAssumptionsPayload = {
  waccPct?: string;
  terminalGrowthPct?: string;
  evEbitdaMultiple?: string;
  evRevenueMultiple?: string;
  peMultiple?: string;
  netDebt?: string;
};

export async function updateValuationAssumptions(
  scenarioId: string,
  payload: ValuationAssumptionsPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
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

export async function updateLoanBookGrowth(
  scenarioId: string,
  formData: FormData,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
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
    await Scenario.updateOne(
      { _id: scenarioId },
      { $unset: { loanBookGrowthPctByYear: "" } },
    );
  } else {
    await Scenario.updateOne(
      { _id: scenarioId },
      { $set: { loanBookGrowthPctByYear: parsed } },
    );
  }
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function toggleLoanIncluded(
  scenarioId: string,
  loanId: string,
  include: boolean,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  await connectToDatabase();
  await Loan.updateOne(
    { _id: loanId, scenarioId },
    { $set: { includeInRevenue: include } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function setLoanProgram(
  scenarioId: string,
  loanId: string,
  formData: FormData,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  const programId = String(formData.get("capitalProgramId") ?? "").trim();
  await connectToDatabase();
  if (!programId) {
    await Loan.updateOne(
      { _id: loanId, scenarioId },
      { $unset: { capitalProgramId: "" } },
    );
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
  channel: "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";
  capitalProgramId?: string;
  balance: string;
  originationDate: string; // YYYY-MM-DD
  maturityDate: string;
  termMonths: number;
  nimDefaultBps?: number;
  nimNegFloorBps?: number;
  nimHardFloorBps?: number;
  creditSpreadBps?: number;
  internalScore?: number;
  internalGrade?: string;
  lvr?: string; // ratio 0..1
  dscr?: string;
};

const LOAN_CHANNELS = new Set([
  "CRE_CLO",
  "CMBS",
  "Warehouse",
  "Non-Conforming",
]);

export async function updateLoan(
  scenarioId: string,
  loanId: string,
  payload: LoanEditPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
  if (!payload.loanId.trim() || !LOAN_CHANNELS.has(payload.channel)) return;
  const origination = new Date(payload.originationDate);
  const maturity = new Date(payload.maturityDate);
  if (Number.isNaN(origination.getTime()) || Number.isNaN(maturity.getTime())) return;
  if (!Number.isFinite(payload.termMonths) || payload.termMonths < 1) return;

  const set: Record<string, unknown> = {
    loanId: payload.loanId.trim(),
    borrower: payload.borrower?.trim() || undefined,
    lenderOfRecord: payload.lenderOfRecord?.trim() || undefined,
    channel: payload.channel,
    balance: toDecimal128(payload.balance),
    originationDate: origination,
    maturityDate: maturity,
    termMonths: payload.termMonths,
  };
  if (payload.capitalProgramId && Types.ObjectId.isValid(payload.capitalProgramId)) {
    set.capitalProgramId = new Types.ObjectId(payload.capitalProgramId);
  }
  if (payload.nimDefaultBps !== undefined) set.nimDefaultBps = payload.nimDefaultBps;
  if (payload.nimNegFloorBps !== undefined) set.nimNegFloorBps = payload.nimNegFloorBps;
  if (payload.nimHardFloorBps !== undefined) set.nimHardFloorBps = payload.nimHardFloorBps;
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

const OPEX_DRIVER_TYPES = new Set([
  "opex_fixed",
  "opex_pct_revenue",
  "opex_per_fte",
]);

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

  await Driver.updateOne(
    { _id: driverId, scenarioId },
    { $set: set, $unset: unset },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteOpexDriver(
  scenarioId: string,
  driverId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(driverId)) return;
  await connectToDatabase();
  await Driver.deleteOne({ _id: driverId, scenarioId });
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
    if (payload.monthlyFeePerSeat)
      doc.monthlyFeePerSeat = toDecimal128(payload.monthlyFeePerSeat);
    if (payload.seatCount !== undefined) doc.seatCount = payload.seatCount;
    if (payload.seatGrowthPctAnnual)
      doc.seatGrowthPctAnnual = toDecimal128(payload.seatGrowthPctAnnual);
    if (payload.billingFrequency) doc.billingFrequency = payload.billingFrequency;
    if (payload.annualDiscountPct)
      doc.annualDiscountPct = toDecimal128(payload.annualDiscountPct);
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
  await PlatformLicense.updateOne(
    { _id: licenseId, scenarioId },
    { $set: set, $unset: unset },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deletePlatformLicense(
  scenarioId: string,
  licenseId: string,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(licenseId)) return;
  await connectToDatabase();
  await PlatformLicense.deleteOne({ _id: licenseId, scenarioId });
  revalidatePath(`/scenarios/${scenarioId}`);
}

export async function deleteLoan(scenarioId: string, loanId: string): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId) || !Types.ObjectId.isValid(loanId)) return;
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
  const name = payload.name?.trim();
  if (!name || name.length > 120) return;
  if (!SCENARIO_STATUSES.has(payload.status)) return;
  await connectToDatabase();
  await Scenario.updateOne(
    { _id: scenarioId },
    { $set: { name, status: payload.status } },
  );
  revalidatePath(`/scenarios/${scenarioId}`);
  revalidatePath("/");
}

// ── Control Panel ──

export type ControlPanelPayload = {
  baseRateType?: "BBSW" | "BBSY" | "SOFR";
  baseRateBps?: number;
  firstYearLabel?: number;
};

const BASE_RATE_TYPES = new Set(["BBSW", "BBSY", "SOFR"]);

export async function updateControlPanel(
  scenarioId: string,
  payload: ControlPanelPayload,
): Promise<void> {
  if (!Types.ObjectId.isValid(scenarioId)) return;
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
