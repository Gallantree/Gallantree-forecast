import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export interface IScenario {
  name: string;
  parentId?: Types.ObjectId;
  isBase?: boolean;
  status: "draft" | "active" | "archived";
  lockedAt?: Date;
  createdBy?: Types.ObjectId;
  dsoDays?: Types.Decimal128;
  dpoDays?: Types.Decimal128;
  taxRatePct?: Types.Decimal128;
  openingCash?: Types.Decimal128;
  openingEquity?: Types.Decimal128;
  defaultCpiPct?: Types.Decimal128;
  defaultSuperPct?: Types.Decimal128;
  nimTier?: "default" | "neg_floor" | "hard_floor";
  createdAt: Date;
  updatedAt: Date;
}

const scenarioSchema = new Schema<IScenario>(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Scenario" },
    isBase: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    lockedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    dsoDays: { type: Schema.Types.Decimal128 },
    dpoDays: { type: Schema.Types.Decimal128 },
    taxRatePct: { type: Schema.Types.Decimal128 },
    openingCash: { type: Schema.Types.Decimal128 },
    openingEquity: { type: Schema.Types.Decimal128 },
    defaultCpiPct: { type: Schema.Types.Decimal128 },
    defaultSuperPct: { type: Schema.Types.Decimal128 },
    nimTier: {
      type: String,
      enum: ["default", "neg_floor", "hard_floor"],
      default: "default",
    },
  },
  { timestamps: true },
);

scenarioSchema.index({ parentId: 1 });
scenarioSchema.index({ status: 1, updatedAt: -1 });
// Sparse partial index so we can ensure at most one base scenario, while
// allowing many non-base rows (isBase=false / unset).
scenarioSchema.index(
  { isBase: 1 },
  { unique: true, partialFilterExpression: { isBase: true } },
);

const Scenario = defineModel<IScenario>("Scenario", scenarioSchema);

export default Scenario;
