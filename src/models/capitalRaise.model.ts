import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type CapitalRaiseType = "equity" | "convertible_note";
export type InvestorStatus = "committed" | "funded" | "withdrawn";

export interface IInvestor {
  _id?: Types.ObjectId;
  name: string;
  commitment: Types.Decimal128;
  fundingDate: Date;
  numNotes?: number;
  status: InvestorStatus;
  notes?: string;
}

export interface IUseOfFundsManualLine {
  _id?: Types.ObjectId;
  label: string;
  amount: Types.Decimal128;
}

// A saved "Use of Funds" plan attached to a capital raise. Captures the
// runway window (coverMonths) and the user's view choices (contingency %,
// whether revenue offsets uses, ad-hoc manual line items). The actual
// staff/OPEX/issuance totals are recomputed live from the engine — only
// the dials and ad-hoc adjustments persist.
export interface IUseOfFundsPlan {
  coverMonths: number;
  contingencyPct: Types.Decimal128;
  includeRevenue: boolean;
  manualLines: IUseOfFundsManualLine[];
}

export interface ICapitalRaise {
  scenarioId: Types.ObjectId;
  name: string;
  type: CapitalRaiseType;
  raiseDate: Date;
  targetSize: Types.Decimal128;
  // Convertible-note only: discount on conversion price vs. next priced round.
  discountPct?: Types.Decimal128;
  // Convertible-note only: cap on conversion valuation.
  valuationCap?: Types.Decimal128;
  // Per-share (equity) or per-note (convertible) price.
  pricePerUnit?: Types.Decimal128;
  investors: IInvestor[];
  useOfFundsPlan?: IUseOfFundsPlan;
  createdAt: Date;
  updatedAt: Date;
}

const investorSchema = new Schema<IInvestor>(
  {
    name: { type: String, required: true, trim: true },
    commitment: { type: Schema.Types.Decimal128, required: true },
    fundingDate: { type: Date, required: true },
    numNotes: { type: Number, min: 0 },
    status: {
      type: String,
      enum: ["committed", "funded", "withdrawn"],
      required: true,
      default: "committed",
    },
    notes: { type: String, trim: true },
  },
  { _id: true },
);

const useOfFundsManualLineSchema = new Schema<IUseOfFundsManualLine>(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Schema.Types.Decimal128, required: true },
  },
  { _id: true },
);

const useOfFundsPlanSchema = new Schema<IUseOfFundsPlan>(
  {
    coverMonths: { type: Number, required: true, min: 1, max: 60 },
    contingencyPct: { type: Schema.Types.Decimal128, required: true },
    includeRevenue: { type: Boolean, required: true, default: false },
    manualLines: { type: [useOfFundsManualLineSchema], default: [] },
  },
  { _id: false },
);

const capitalRaiseSchema = new Schema<ICapitalRaise>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["equity", "convertible_note"], required: true },
    raiseDate: { type: Date, required: true },
    targetSize: { type: Schema.Types.Decimal128, required: true },
    discountPct: { type: Schema.Types.Decimal128 },
    valuationCap: { type: Schema.Types.Decimal128 },
    pricePerUnit: { type: Schema.Types.Decimal128 },
    investors: { type: [investorSchema], default: [] },
    useOfFundsPlan: { type: useOfFundsPlanSchema, default: undefined },
  },
  { timestamps: true },
);

capitalRaiseSchema.index({ scenarioId: 1, raiseDate: 1 });

const CapitalRaise = defineModel<ICapitalRaise>("CapitalRaise", capitalRaiseSchema);

export default CapitalRaise;
