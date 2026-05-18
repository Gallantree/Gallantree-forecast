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

export interface ICapitalProgram {
  scenarioId: Types.ObjectId;
  name: string;
  type: CapitalProgramType;
  dealSize?: Types.Decimal128;
  startPeriodKey: string;
  endPeriodKey?: string;
  notes?: string;
  fees: IProgramFee[];
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
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    notes: { type: String, trim: true },
    fees: { type: [programFeeSchema], default: [] },
  },
  { timestamps: true },
);

capitalProgramSchema.index({ scenarioId: 1, name: 1 });

const CapitalProgram = defineModel<ICapitalProgram>("CapitalProgram", capitalProgramSchema);

export default CapitalProgram;
