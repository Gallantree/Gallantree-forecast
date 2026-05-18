import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type PlatformLicenseType = "compliance" | "trustee";
export type ComplianceTier = "starter" | "standard" | "professional" | "custom";
export type BillingFrequency = "monthly" | "annual";

export interface IPlatformLicense {
  scenarioId: Types.ObjectId;
  name: string;
  type: PlatformLicenseType;
  startPeriodKey: string;
  endPeriodKey?: string;
  accountCode?: string; // override; defaults by type (4600 / 4610)
  notes?: string;

  // ── Compliance (Gallantree compliance SaaS) ──
  tier?: ComplianceTier;
  monthlyFeePerSeat?: Types.Decimal128;
  seatCount?: number;
  seatGrowthPctAnnual?: Types.Decimal128;
  billingFrequency?: BillingFrequency;
  annualDiscountPct?: Types.Decimal128;

  // ── Trustee (platform licensed to Gallantree's trustee) ──
  monthlyFee?: Types.Decimal128;
  configFee?: Types.Decimal128;
  aumByYear?: Types.Decimal128[];
  feePctOfAumByYear?: Types.Decimal128[];

  createdAt: Date;
  updatedAt: Date;
}

const periodPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

const schema = new Schema<IPlatformLicense>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["compliance", "trustee"], required: true },
    startPeriodKey: { type: String, required: true, match: periodPattern },
    endPeriodKey: { type: String, match: periodPattern },
    accountCode: { type: String, trim: true },
    notes: { type: String, trim: true },

    tier: { type: String, enum: ["starter", "standard", "professional", "custom"] },
    monthlyFeePerSeat: { type: Schema.Types.Decimal128 },
    seatCount: { type: Number, min: 0 },
    seatGrowthPctAnnual: { type: Schema.Types.Decimal128 },
    billingFrequency: { type: String, enum: ["monthly", "annual"] },
    annualDiscountPct: { type: Schema.Types.Decimal128 },

    monthlyFee: { type: Schema.Types.Decimal128 },
    configFee: { type: Schema.Types.Decimal128 },
    aumByYear: { type: [Schema.Types.Decimal128], default: undefined },
    feePctOfAumByYear: { type: [Schema.Types.Decimal128], default: undefined },
  },
  { timestamps: true },
);

schema.index({ scenarioId: 1, type: 1 });

const PlatformLicense = defineModel<IPlatformLicense>("PlatformLicense", schema);
export default PlatformLicense;
