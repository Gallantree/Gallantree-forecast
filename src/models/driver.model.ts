import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type DriverType = "recurring_revenue" | "opex_fixed" | "opex_pct_revenue";

export interface IDriver {
  scenarioId: Types.ObjectId;
  name: string;
  accountCode: string;
  type: DriverType;
  startPeriodKey: string;
  endPeriodKey?: string;
  baseMonthly?: Types.Decimal128;
  monthlyGrowthPct?: Types.Decimal128;
  pctOfRevenue?: Types.Decimal128;
  createdAt: Date;
  updatedAt: Date;
}

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const driverSchema = new Schema<IDriver>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["recurring_revenue", "opex_fixed", "opex_pct_revenue"],
      required: true,
    },
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    baseMonthly: { type: Schema.Types.Decimal128 },
    monthlyGrowthPct: { type: Schema.Types.Decimal128 },
    pctOfRevenue: { type: Schema.Types.Decimal128 },
  },
  { timestamps: true },
);

driverSchema.index({ scenarioId: 1, accountCode: 1 });
driverSchema.index({ scenarioId: 1, type: 1 });

const Driver = defineModel<IDriver>("Driver", driverSchema);

export default Driver;
