import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export interface IAssumption {
  scenarioId: Types.ObjectId;
  driverId: string;
  periodKey: string;
  value: Types.Decimal128;
  createdAt: Date;
  updatedAt: Date;
}

const assumptionSchema = new Schema<IAssumption>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    driverId: { type: String, required: true },
    periodKey: { type: String, required: true },
    value: { type: Schema.Types.Decimal128, required: true },
  },
  { timestamps: true },
);

assumptionSchema.index({ scenarioId: 1, driverId: 1, periodKey: 1 }, { unique: true });

const Assumption = defineModel<IAssumption>("Assumption", assumptionSchema);

export default Assumption;
