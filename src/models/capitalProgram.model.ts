import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type CapitalProgramType = "CRE_CLO" | "CMBS" | "MIT_FUND" | "WAREHOUSE" | "OTHER";

export interface IProgramFee {
  _id?: Types.ObjectId;
  name: string;
  category: "senior_mgmt" | "subordinate_mgmt" | "servicing" | "other";
  basisAmount: Types.Decimal128;
  feeBps: number;
  accountCode: string;
}

export type LiabilityCalculationMethod = "monthly" | "quarterly" | "annually";
export type LiabilityRateType = "fixed" | "variable";

export interface IProgramLiability {
  _id?: Types.ObjectId;
  name: string; // e.g. "AAA", "Mezz"
  numNotes?: number;
  returnProfileBps: number; // spread over base rate (or absolute if fixed)
  calculationMethod: LiabilityCalculationMethod;
  rateType: LiabilityRateType;
  accountCode?: string; // interest expense account this tranche posts to
}

// One-off costs incurred at issuance — credit underwriter retainer, legal
// counsel, ratings agency presale fees, etc. Distinct from `fees` (the
// recurring annual mgmt / servicing streams) and from `liabilities` (the
// note tranches paying ongoing interest). Recorded so the model can amortise
// or expense them per the user's preference. Typical CRE CLO issuance:
// ~$500k underwriter, ~$900k legal, ~$300k credit ratings.
export type UpfrontFeeCategory = "underwriter" | "legal" | "credit_rating" | "other";

export interface IProgramUpfrontFee {
  _id?: Types.ObjectId;
  name: string;
  category: UpfrontFeeCategory;
  amount: Types.Decimal128;
  accountCode?: string;
}

// Captive equity-tranche holdings — used by MIT_FUND programs (e.g. the
// Gallantree Enhanced Income Funds) that acquire the equity tranches of
// other capital programs in the same scenario. Each entry pins the source
// program + the tranche name being held; the fund itself decides how many
// units / what share it owns via its own liability line.
export interface IProgramEquityHolding {
  _id?: Types.ObjectId;
  programId: Types.ObjectId;
  trancheName: string;
}

export interface ICapitalProgram {
  scenarioId: Types.ObjectId;
  name: string;
  type: CapitalProgramType;
  dealSize?: Types.Decimal128;
  faceValuePerNote?: Types.Decimal128;
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: IProgramFee[];
  liabilities: IProgramLiability[];
  upfrontFees: IProgramUpfrontFee[];
  // Expected portfolio-level arrears rate for this program — what % of the
  // loans booked into this program we expect to be in any arrears bucket
  // (30/60/90/default) at any given time. Stored as a decimal fraction
  // (0.05 = 5%). Used by the loan-book seed to bias status assignments and
  // by the toolbar ARREARS tile to show actual vs target.
  arrearsPctTarget?: Types.Decimal128;
  // Share of servicing-fee revenue that Gallantree retains for this program.
  // Stored as a decimal fraction (0.33 = 33%). The rest is a pass-through to
  // the loan originator or trustee and is excluded from Gallantree's P&L.
  // Applied in the engine only to fees with category === "servicing"; absent
  // → defaults to 0.33 at projection time.
  gallantreeSharePct?: Types.Decimal128;
  // Stepped monthly ramp-up of the deal balance. During the first
  // `rampUpMonths` from `startPeriodKey`, the program's loan revenue and
  // management/servicing fees ramp linearly to 100%. Note interest expense
  // and the notes-payable BS balance ramp in step. Absent or 0 → no ramp.
  rampUpMonths?: number;
  // Linear tail amortisation. During the final `amortisationMonths` of the
  // program (ending at `endPeriodKey`), loan revenue, fees, and notes wind
  // down to zero. Absent or 0 → bullet maturity.
  amortisationMonths?: number;
  // Equity tranches of OTHER programs that this program (typically a
  // MIT_FUND like the Gallantree Enhanced Income Fund) holds. Empty for
  // standard CRE CLO / CMBS / BSL / Warehouse programs.
  captiveEquityHoldings?: IProgramEquityHolding[];
  createdAt: Date;
  updatedAt: Date;
}

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const programFeeSchema = new Schema<IProgramFee>(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["senior_mgmt", "subordinate_mgmt", "servicing", "other"],
      required: true,
    },
    basisAmount: { type: Schema.Types.Decimal128, required: true },
    feeBps: { type: Number, required: true, min: 0 },
    accountCode: { type: String, required: true, trim: true },
  },
  { _id: true },
);

const programUpfrontFeeSchema = new Schema<IProgramUpfrontFee>(
  {
    name: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["underwriter", "legal", "credit_rating", "other"],
      required: true,
    },
    amount: { type: Schema.Types.Decimal128, required: true },
    accountCode: { type: String, trim: true },
  },
  { _id: true },
);

const programLiabilitySchema = new Schema<IProgramLiability>(
  {
    name: { type: String, required: true, trim: true },
    numNotes: { type: Number, min: 0 },
    returnProfileBps: { type: Number, required: true, min: 0 },
    calculationMethod: {
      type: String,
      enum: ["monthly", "quarterly", "annually"],
      required: true,
      default: "monthly",
    },
    rateType: {
      type: String,
      enum: ["fixed", "variable"],
      required: true,
      default: "fixed",
    },
    accountCode: { type: String, trim: true },
  },
  { _id: true },
);

const programEquityHoldingSchema = new Schema<IProgramEquityHolding>(
  {
    programId: { type: Schema.Types.ObjectId, ref: "CapitalProgram", required: true },
    trancheName: { type: String, required: true, trim: true },
  },
  { _id: true },
);

const capitalProgramSchema = new Schema<ICapitalProgram>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["CRE_CLO", "CMBS", "MIT_FUND", "WAREHOUSE", "OTHER"],
      required: true,
    },
    dealSize: { type: Schema.Types.Decimal128 },
    faceValuePerNote: { type: Schema.Types.Decimal128 },
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    notes: { type: String, trim: true },
    fees: { type: [programFeeSchema], default: [] },
    liabilities: { type: [programLiabilitySchema], default: [] },
    upfrontFees: { type: [programUpfrontFeeSchema], default: [] },
    arrearsPctTarget: { type: Schema.Types.Decimal128 },
    gallantreeSharePct: { type: Schema.Types.Decimal128 },
    rampUpMonths: { type: Number, min: 0 },
    amortisationMonths: { type: Number, min: 0 },
    captiveEquityHoldings: { type: [programEquityHoldingSchema], default: [] },
  },
  { timestamps: true },
);

capitalProgramSchema.index({ scenarioId: 1, name: 1 });

const CapitalProgram = defineModel<ICapitalProgram>("CapitalProgram", capitalProgramSchema);

export default CapitalProgram;
