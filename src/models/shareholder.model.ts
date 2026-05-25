import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type ShareClass = "Founder Shares" | "Ordinary" | "Preference";

export interface IShareholder {
  scenarioId: Types.ObjectId;
  name: string;
  entityTrust?: string;
  shareClass: ShareClass | string;
  shares: number;
  pricePerShare: Types.Decimal128;
  beneficiallyHeld: boolean;
  dateOfIssue: Date;
  createdAt: Date;
  updatedAt: Date;
}

const shareholderSchema = new Schema<IShareholder>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    entityTrust: { type: String, trim: true },
    shareClass: { type: String, required: true, trim: true },
    shares: { type: Number, required: true, min: 1 },
    pricePerShare: { type: Schema.Types.Decimal128, required: true },
    beneficiallyHeld: { type: Boolean, required: true, default: false },
    dateOfIssue: { type: Date, required: true },
  },
  { timestamps: true },
);

shareholderSchema.index({ scenarioId: 1, shares: -1 });

const Shareholder = defineModel<IShareholder>("Shareholder", shareholderSchema);

export default Shareholder;
