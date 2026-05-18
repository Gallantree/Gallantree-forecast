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
  // Per-FY growth/decline applied to the loan book NIM. Element [k] is the
  // growth rate during forecast year k+1, compounded monthly within the year
  // and onto prior years. Years beyond the array default to 0 (no growth).
  loanBookGrowthPctByYear?: Types.Decimal128[];
  // Valuation assumptions
  waccPct?: Types.Decimal128;
  terminalGrowthPct?: Types.Decimal128;
  evEbitdaMultiple?: Types.Decimal128;
  evRevenueMultiple?: Types.Decimal128;
  peMultiple?: Types.Decimal128;
  netDebt?: Types.Decimal128;
  // Control panel — global rate context + year-label config
  baseRateType?: "BBSW" | "BBSY" | "SOFR";
  baseRateBps?: number;
  firstYearLabel?: number; // calendar year shown for Year 1 columns
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
    loanBookGrowthPctByYear: { type: [Schema.Types.Decimal128], default: undefined },
    waccPct: { type: Schema.Types.Decimal128 },
    terminalGrowthPct: { type: Schema.Types.Decimal128 },
    evEbitdaMultiple: { type: Schema.Types.Decimal128 },
    evRevenueMultiple: { type: Schema.Types.Decimal128 },
    peMultiple: { type: Schema.Types.Decimal128 },
    netDebt: { type: Schema.Types.Decimal128 },
    baseRateType: { type: String, enum: ["BBSW", "BBSY", "SOFR"] },
    baseRateBps: { type: Number, min: 0 },
    firstYearLabel: { type: Number, min: 2000, max: 2100 },
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
