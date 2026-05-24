import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type GrowthRiskLevel = "low" | "medium" | "high";

export interface IBookGrowthProfile {
  _id?: Types.ObjectId;
  // Target capital program. Synthetic loans inherit this program's id and
  // route revenue through it.
  capitalProgramId: Types.ObjectId;
  // Per-FY growth pct, [k] = growth during FY index k (0-indexed across the
  // scenario's horizon). Compounded year-on-year against the running baseline.
  fyGrowthPcts: Types.Decimal128[];
  avgTenorMonths: number;
  avgSpreadBps: number;
  riskLevel: GrowthRiskLevel;
}

export type ScenarioViewMode = "all" | "gallantree";

export interface IScenario {
  name: string;
  parentId?: Types.ObjectId;
  isBase?: boolean;
  // Which tab profile this scenario uses. 'all' shows the full consolidated
  // workspace; 'gallantree' shows only the Gallantree-specific operating view
  // (overview-gallantree, pnl-gallantree, opex, platform revenues, capital raises).
  viewMode?: ScenarioViewMode;
  status: "draft" | "active" | "archived";
  lockedAt?: Date;
  createdBy?: Types.ObjectId;
  organisationId?: Types.ObjectId;
  deletedAt?: Date;
  dsoDays?: Types.Decimal128;
  dpoDays?: Types.Decimal128;
  taxRatePct?: Types.Decimal128;
  openingCash?: Types.Decimal128;
  openingEquity?: Types.Decimal128;
  defaultCpiPct?: Types.Decimal128;
  defaultSuperPct?: Types.Decimal128;
  // Per-FY growth/decline applied to the loan book NIM. Element [k] is the
  // growth rate during forecast year k+1, compounded monthly within the year
  // and onto prior years. Years beyond the array default to 0 (no growth).
  loanBookGrowthPctByYear?: Types.Decimal128[];
  // Per-channel synthetic loan growth profiles. The engine injects deterministic
  // synthetic loans each FY according to these profiles, replacing the simpler
  // loanBookGrowthPctByYear lever.
  bookGrowthProfiles?: IBookGrowthProfile[];
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
  // Target end-of-FY total headcount, one entry per forecast year. Drives the
  // "Plan growth" modal: deltas vs. the actual + previously-planned headcount
  // become placeholder Headcount documents flagged isGrowth that flow through
  // the staffing cost projection. Length matches the 5-year horizon; missing
  // entries are treated as "no target" (zero delta).
  staffTargetByYear?: number[];
  createdAt: Date;
  updatedAt: Date;
}

const bookGrowthProfileSchema = new Schema<IBookGrowthProfile>(
  {
    capitalProgramId: {
      type: Schema.Types.ObjectId,
      ref: "CapitalProgram",
      required: true,
    },
    // mongoose's nested sub-schema typing trips up on typed Decimal128[] —
    // declare loosely; the IBookGrowthProfile interface keeps callers honest.
    fyGrowthPcts: [Schema.Types.Decimal128],
    avgTenorMonths: { type: Number, required: true, min: 1, max: 600 },
    avgSpreadBps: { type: Number, required: true, min: 0, max: 10000 },
    riskLevel: { type: String, enum: ["low", "medium", "high"], required: true },
  },
  { _id: true },
);

const scenarioSchema = new Schema<IScenario>(
  {
    name: { type: String, required: true, trim: true },
    parentId: { type: Schema.Types.ObjectId, ref: "Scenario" },
    isBase: { type: Boolean, default: false },
    viewMode: { type: String, enum: ["all", "gallantree"], default: "all" },
    status: { type: String, enum: ["draft", "active", "archived"], default: "draft" },
    lockedAt: { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    organisationId: { type: Schema.Types.ObjectId, ref: "Organisation" },
    deletedAt: { type: Date, default: null },
    dsoDays: { type: Schema.Types.Decimal128 },
    dpoDays: { type: Schema.Types.Decimal128 },
    taxRatePct: { type: Schema.Types.Decimal128 },
    openingCash: { type: Schema.Types.Decimal128 },
    openingEquity: { type: Schema.Types.Decimal128 },
    defaultCpiPct: { type: Schema.Types.Decimal128 },
    defaultSuperPct: { type: Schema.Types.Decimal128 },
    loanBookGrowthPctByYear: { type: [Schema.Types.Decimal128], default: undefined },
    bookGrowthProfiles: { type: [bookGrowthProfileSchema], default: [] },
    waccPct: { type: Schema.Types.Decimal128 },
    terminalGrowthPct: { type: Schema.Types.Decimal128 },
    evEbitdaMultiple: { type: Schema.Types.Decimal128 },
    evRevenueMultiple: { type: Schema.Types.Decimal128 },
    peMultiple: { type: Schema.Types.Decimal128 },
    netDebt: { type: Schema.Types.Decimal128 },
    baseRateType: { type: String, enum: ["BBSW", "BBSY", "SOFR"] },
    baseRateBps: { type: Number, min: 0 },
    firstYearLabel: { type: Number, min: 2000, max: 2100 },
    staffTargetByYear: { type: [Number], default: undefined },
  },
  { timestamps: true },
);

scenarioSchema.index({ parentId: 1 });
scenarioSchema.index({ status: 1, updatedAt: -1 });
scenarioSchema.index({ organisationId: 1, deletedAt: 1 });
scenarioSchema.index({ deletedAt: 1 });
// Sparse partial index so we can ensure at most one base scenario per
// viewMode, while allowing many non-base rows (isBase=false / unset).
scenarioSchema.index(
  { viewMode: 1, isBase: 1 },
  { unique: true, partialFilterExpression: { isBase: true } },
);

const Scenario = defineModel<IScenario>("Scenario", scenarioSchema);

export default Scenario;
