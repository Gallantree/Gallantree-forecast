import mongoose, { Schema, type Types } from "mongoose";

export type DriverType = "recurring_revenue";

export interface IDriver {
  scenarioId: Types.ObjectId;
  name: string;
  accountCode: string;
  type: DriverType;
  startPeriodKey: string;
  baseMonthly: Types.Decimal128;
  monthlyGrowthPct: Types.Decimal128;
  createdAt: Date;
  updatedAt: Date;
}

const driverSchema = new Schema<IDriver>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    type: { type: String, enum: ["recurring_revenue"], required: true },
    startPeriodKey: {
      type: String,
      required: true,
      match: /^\d{4}-(0[1-9]|1[0-2])$/,
    },
    baseMonthly: { type: Schema.Types.Decimal128, required: true },
    monthlyGrowthPct: { type: Schema.Types.Decimal128, required: true },
  },
  { timestamps: true },
);

driverSchema.index({ scenarioId: 1, accountCode: 1 });

const Driver =
  mongoose.models.Driver || mongoose.model<IDriver>("Driver", driverSchema);

export default Driver;
