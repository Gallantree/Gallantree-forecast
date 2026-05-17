import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export interface IHeadcount {
  scenarioId: Types.ObjectId;
  role: string;
  accountCode: string;
  startPeriodKey: string;
  endPeriodKey?: string;
  salaryAnnual: Types.Decimal128;
  onCostPct: Types.Decimal128;
  salaryGrowthPctAnnual: Types.Decimal128;
  createdAt: Date;
  updatedAt: Date;
}

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const headcountSchema = new Schema<IHeadcount>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    role: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    salaryAnnual: { type: Schema.Types.Decimal128, required: true },
    onCostPct: { type: Schema.Types.Decimal128, required: true },
    salaryGrowthPctAnnual: { type: Schema.Types.Decimal128, required: true },
  },
  { timestamps: true },
);

headcountSchema.index({ scenarioId: 1, accountCode: 1 });

const Headcount = defineModel<IHeadcount>("Headcount", headcountSchema);

export default Headcount;
