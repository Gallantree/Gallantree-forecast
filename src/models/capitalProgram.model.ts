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
  },
  { timestamps: true },
);

capitalProgramSchema.index({ scenarioId: 1, name: 1 });

const CapitalProgram = defineModel<ICapitalProgram>("CapitalProgram", capitalProgramSchema);

export default CapitalProgram;
