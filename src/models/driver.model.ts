import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type DriverType =
  | "recurring_revenue"
  | "fee_x_volume"
  | "one_off"
  | "opex_fixed"
  | "opex_pct_revenue"
  | "opex_per_fte"
  | "capex_straight_line";

export interface IDriver {
  scenarioId: Types.ObjectId;
  name: string;
  accountCode: string;
  type: DriverType;
  startPeriodKey: string;
  endPeriodKey?: string;
  // recurring_revenue, opex_fixed
  baseMonthly?: Types.Decimal128;
  monthlyGrowthPct?: Types.Decimal128;
  // opex_pct_revenue
  pctOfRevenue?: Types.Decimal128;
  // fee_x_volume
  feeBps?: Types.Decimal128;
  volumeMonthly?: Types.Decimal128;
  volumeMonthlyGrowthPct?: Types.Decimal128;
  // one_off
  amount?: Types.Decimal128;
  periodKey?: string;
  // opex_per_fte
  costPerFteMonthly?: Types.Decimal128;
  // capex_straight_line
  cost?: Types.Decimal128;
  inServicePeriodKey?: string;
  usefulLifeMonths?: number;
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
      enum: [
        "recurring_revenue",
        "fee_x_volume",
        "one_off",
        "opex_fixed",
        "opex_pct_revenue",
        "opex_per_fte",
        "capex_straight_line",
      ],
      required: true,
    },
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    baseMonthly: { type: Schema.Types.Decimal128 },
    monthlyGrowthPct: { type: Schema.Types.Decimal128 },
    pctOfRevenue: { type: Schema.Types.Decimal128 },
    feeBps: { type: Schema.Types.Decimal128 },
    volumeMonthly: { type: Schema.Types.Decimal128 },
    volumeMonthlyGrowthPct: { type: Schema.Types.Decimal128 },
    amount: { type: Schema.Types.Decimal128 },
    periodKey: { type: String, match: periodPattern },
    costPerFteMonthly: { type: Schema.Types.Decimal128 },
    cost: { type: Schema.Types.Decimal128 },
    inServicePeriodKey: { type: String, match: periodPattern },
    usefulLifeMonths: { type: Number, min: 1 },
  },
  { timestamps: true },
);

driverSchema.index({ scenarioId: 1, accountCode: 1 });
driverSchema.index({ scenarioId: 1, type: 1 });

const Driver = defineModel<IDriver>("Driver", driverSchema);

export default Driver;
