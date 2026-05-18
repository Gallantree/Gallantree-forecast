import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export interface IPayband {
  band: number;
  tier: number;
  salaryAnnual?: Types.Decimal128;
  caseByCase: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paybandSchema = new Schema<IPayband>(
  {
    band: { type: Number, required: true, min: 1, max: 11 },
    tier: { type: Number, required: true, min: 1, max: 4 },
    salaryAnnual: { type: Schema.Types.Decimal128 },
    caseByCase: { type: Boolean, default: false },
  },
  { timestamps: true },
);

paybandSchema.index({ band: 1, tier: 1 }, { unique: true });

const Payband = defineModel<IPayband>("Payband", paybandSchema);

export default Payband;
