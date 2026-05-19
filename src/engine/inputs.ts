import { CapitalProgram, Driver, Headcount, Loan, PlatformLicense } from "@/models";
import { dateToPeriodKey, type LoanInput, PROGRAM_TYPE_ACCOUNT, type ProgramType } from "./loans";
import type { PlatformLicenseInput } from "./platformLicenses";
import type { DriverInput, HeadcountInput } from "./pnl";
import type {
  LiabilityCalculationMethod,
  LiabilityRateType,
  ProgramLiabilityInput,
} from "./programLiabilities";
import type { FeeCategory, ProgramFeeInput } from "./programs";

type D128 = { toString: () => string };

interface DriverDoc {
  _id: unknown;
  name: string;
  type:
    | "recurring_revenue"
    | "fee_x_volume"
    | "one_off"
    | "opex_fixed"
    | "opex_pct_revenue"
    | "opex_per_fte"
    | "capex_straight_line";
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  baseMonthly?: D128;
  monthlyGrowthPct?: D128;
  pctOfRevenue?: D128;
  feeBps?: D128;
  volumeMonthly?: D128;
  volumeMonthlyGrowthPct?: D128;
  amount?: D128;
  periodKey?: string;
  costPerFteMonthly?: D128;
  cost?: D128;
  inServicePeriodKey?: string;
  usefulLifeMonths?: number;
}

interface HeadcountDoc {
  _id: unknown;
  personName?: string;
  role: string;
  accountCode: string;
  employmentType?: "full_time" | "part_time" | "contractor";
  ftePct?: D128;
  band?: number;
  tier?: number;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: D128;
  superPct?: D128;
  onCostPct: D128;
  salaryGrowthPctAnnual: D128;
}

function toDriverInput(d: DriverDoc): DriverInput {
  const id = String(d._id);
  const baseFields = {
    id,
    name: d.name,
    accountCode: d.accountCode,
    startPeriodKey: d.startPeriodKey,
    endPeriodKey: d.endPeriodKey,
  };
  switch (d.type) {
    case "recurring_revenue":
      return {
        kind: "recurring_revenue",
        ...baseFields,
        baseMonthly: d.baseMonthly!.toString(),
        monthlyGrowthPct: d.monthlyGrowthPct!.toString(),
      };
    case "fee_x_volume":
      return {
        kind: "fee_x_volume",
        ...baseFields,
        feeBps: d.feeBps!.toString(),
        volumeMonthly: d.volumeMonthly!.toString(),
        volumeMonthlyGrowthPct: d.volumeMonthlyGrowthPct!.toString(),
      };
    case "one_off":
      return {
        kind: "one_off",
        ...baseFields,
        amount: d.amount!.toString(),
        periodKey: d.periodKey!,
      };
    case "opex_fixed":
      return {
        kind: "opex_fixed",
        ...baseFields,
        baseMonthly: d.baseMonthly!.toString(),
        monthlyGrowthPct: d.monthlyGrowthPct!.toString(),
      };
    case "opex_pct_revenue":
      return {
        kind: "opex_pct_revenue",
        ...baseFields,
        pctOfRevenue: d.pctOfRevenue!.toString(),
      };
    case "opex_per_fte":
      return {
        kind: "opex_per_fte",
        ...baseFields,
        costPerFteMonthly: d.costPerFteMonthly!.toString(),
      };
    case "capex_straight_line":
      return {
        kind: "capex_straight_line",
        ...baseFields,
        cost: d.cost!.toString(),
        inServicePeriodKey: d.inServicePeriodKey!,
        usefulLifeMonths: d.usefulLifeMonths!,
      };
  }
}

function toHeadcountInput(h: HeadcountDoc): HeadcountInput {
  return {
    id: String(h._id),
    personName: h.personName,
    role: h.role,
    accountCode: h.accountCode,
    employmentType: h.employmentType,
    ftePct: h.ftePct?.toString() ?? "1",
    band: h.band,
    tier: h.tier,
    startPeriodKey: h.startPeriodKey,
    endPeriodKey: h.endPeriodKey,
    salaryAnnual: h.salaryAnnual.toString(),
    superPct: h.superPct?.toString() ?? "0",
    onCostPct: h.onCostPct.toString(),
    salaryGrowthPctAnnual: h.salaryGrowthPctAnnual.toString(),
  };
}

interface LoanDoc {
  _id: unknown;
  loanId: string;
  capitalProgramId?: unknown;
  balance: D128;
  originationDate: Date;
  maturityDate: Date;
  creditSpreadBps?: number;
  includeInRevenue?: boolean;
}

function toLoanInput(l: LoanDoc, accountCode: string): LoanInput {
  return {
    id: String(l._id),
    loanId: l.loanId,
    capitalProgramId: String(l.capitalProgramId),
    accountCode,
    balance: l.balance.toString(),
    originationPeriodKey: dateToPeriodKey(new Date(l.originationDate)),
    maturityPeriodKey: dateToPeriodKey(new Date(l.maturityDate)),
    creditSpreadBps: l.creditSpreadBps ?? 0,
  };
}

interface ProgramFeeDoc {
  _id: unknown;
  name: string;
  category: FeeCategory;
  basisAmount: D128;
  feeBps: number;
  accountCode: string;
}

interface ProgramLiabilityDoc {
  _id: unknown;
  name: string;
  numNotes?: number;
  returnProfileBps: number;
  calculationMethod: LiabilityCalculationMethod;
  rateType: LiabilityRateType;
  accountCode?: string;
}

interface ProgramDoc {
  _id: unknown;
  name: string;
  type: string;
  faceValuePerNote?: D128;
  startPeriodKey: string;
  endPeriodKey?: string;
  fees: ProgramFeeDoc[];
  liabilities?: ProgramLiabilityDoc[];
}

function flattenProgramFees(programs: ProgramDoc[]): ProgramFeeInput[] {
  const out: ProgramFeeInput[] = [];
  for (const p of programs) {
    for (const f of p.fees ?? []) {
      out.push({
        id: String(f._id),
        programId: String(p._id),
        programName: p.name,
        programType: p.type,
        feeName: f.name,
        category: f.category,
        basisAmount: f.basisAmount.toString(),
        feeBps: f.feeBps,
        accountCode: f.accountCode,
        startPeriodKey: p.startPeriodKey,
        endPeriodKey: p.endPeriodKey,
      });
    }
  }
  return out;
}

function flattenProgramLiabilities(programs: ProgramDoc[]): ProgramLiabilityInput[] {
  const out: ProgramLiabilityInput[] = [];
  for (const p of programs) {
    const fvStr = p.faceValuePerNote?.toString();
    const faceValue = fvStr ? Number(fvStr) : 0;
    for (const l of p.liabilities ?? []) {
      const principal = (l.numNotes ?? 0) * faceValue;
      out.push({
        id: String(l._id),
        programId: String(p._id),
        programName: p.name,
        trancheName: l.name,
        principal,
        returnProfileBps: l.returnProfileBps,
        rateType: l.rateType,
        calculationMethod: l.calculationMethod,
        accountCode: l.accountCode ?? "6800",
        startPeriodKey: p.startPeriodKey,
        endPeriodKey: p.endPeriodKey,
      });
    }
  }
  return out;
}

interface LicenseDoc {
  _id: unknown;
  name: string;
  type: "compliance" | "trustee";
  startPeriodKey: string;
  endPeriodKey?: string;
  accountCode?: string;
  // compliance
  monthlyFeePerSeat?: D128;
  seatCount?: number;
  seatGrowthPctAnnual?: D128;
  billingFrequency?: "monthly" | "annual";
  annualDiscountPct?: D128;
  // trustee
  monthlyFee?: D128;
  configFee?: D128;
  aumByYear?: D128[];
  feePctOfAumByYear?: D128[];
}

function toLicenseInput(l: LicenseDoc): PlatformLicenseInput {
  const base = {
    id: String(l._id),
    name: l.name,
    startPeriodKey: l.startPeriodKey,
    endPeriodKey: l.endPeriodKey,
    accountCode: l.accountCode,
  };
  if (l.type === "compliance") {
    return {
      ...base,
      type: "compliance",
      monthlyFeePerSeat: l.monthlyFeePerSeat?.toString() ?? "0",
      seatCount: l.seatCount ?? 0,
      seatGrowthPctAnnual: l.seatGrowthPctAnnual?.toString() ?? "0",
      billingFrequency: l.billingFrequency,
      annualDiscountPct: l.annualDiscountPct?.toString() ?? "0",
    };
  }
  return {
    ...base,
    type: "trustee",
    monthlyFee: l.monthlyFee?.toString() ?? "0",
    configFee: l.configFee?.toString() ?? "0",
    aumByYear: (l.aumByYear ?? []).map((v) => v.toString()),
    feePctOfAumByYear: (l.feePctOfAumByYear ?? []).map((v) => v.toString()),
  };
}

export async function loadEngineInputs(scenarioId: string): Promise<{
  drivers: DriverInput[];
  headcount: HeadcountInput[];
  loans: LoanInput[];
  programFees: ProgramFeeInput[];
  programLiabilities: ProgramLiabilityInput[];
  platformLicenses: PlatformLicenseInput[];
}> {
  const [driverDocs, headcountDocs, loanDocs, programDocs, licenseDocs] = await Promise.all([
    Driver.find({ scenarioId }).lean<DriverDoc[]>(),
    Headcount.find({ scenarioId }).lean<HeadcountDoc[]>(),
    Loan.find({ scenarioId }).lean<LoanDoc[]>(),
    CapitalProgram.find({ scenarioId }).lean<ProgramDoc[]>(),
    PlatformLicense.find({ scenarioId }).lean<LicenseDoc[]>(),
  ]);
  return {
    drivers: driverDocs.map(toDriverInput),
    headcount: headcountDocs.map(toHeadcountInput),
    // Loans contribute to revenue only when they're (a) explicitly included and
    // (b) assigned to a capital program. Account code is resolved from the
    // program's type.
    loans: (() => {
      const programAccount = new Map<string, string>();
      for (const p of programDocs) {
        const t = p.type as ProgramType;
        programAccount.set(String(p._id), PROGRAM_TYPE_ACCOUNT[t] ?? "4400");
      }
      return loanDocs
        .filter((l) => l.includeInRevenue !== false)
        .filter((l) => l.capitalProgramId)
        .map((l) => {
          const acct = programAccount.get(String(l.capitalProgramId)) ?? "4400";
          return toLoanInput(l, acct);
        });
    })(),
    programFees: flattenProgramFees(programDocs),
    programLiabilities: flattenProgramLiabilities(programDocs),
    platformLicenses: licenseDocs.map(toLicenseInput),
  };
}
