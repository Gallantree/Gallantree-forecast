import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type LoanChannel = "CRE_CLO" | "CMBS" | "Warehouse" | "Non-Conforming";

export interface ILoan {
  scenarioId: Types.ObjectId;
  capitalProgramId?: Types.ObjectId;
  loanId: string;
  borrower?: string;
  lenderOfRecord?: string;
  state?: string;
  postcode?: string;
  assetClass?: string;
  propertyStatus?: string;
  location?: string;
  channel: LoanChannel;
  originationDate: Date;
  maturityDate: Date;
  termMonths: number;
  balance: Types.Decimal128;
  propertyValue?: Types.Decimal128;
  lvr?: Types.Decimal128;
  noi?: Types.Decimal128;
  ncf?: Types.Decimal128;
  icr?: Types.Decimal128;
  dscr?: Types.Decimal128;
  wale?: Types.Decimal128;
  internalScore?: number;
  internalGrade?: string;
  fitchIndicative?: string;
  moodysIndicative?: string;
  binding?: string;
  creditSpreadBps?: number;
  nimDefaultBps?: number;
  nimNegFloorBps?: number;
  nimHardFloorBps?: number;
  marginBps?: number;
  bbsw1mBps?: number;
  allInBps?: number;
  allInPct?: Types.Decimal128;
  annualInterest?: Types.Decimal128;
  includeInRevenue: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const loanSchema = new Schema<ILoan>(
  {
    scenarioId: { type: Schema.Types.ObjectId, ref: "Scenario", required: true },
    capitalProgramId: { type: Schema.Types.ObjectId, ref: "CapitalProgram" },
    loanId: { type: String, required: true, trim: true },
    borrower: { type: String, trim: true },
    lenderOfRecord: { type: String, trim: true },
    state: { type: String, trim: true },
    postcode: { type: String, trim: true },
    assetClass: { type: String, trim: true },
    propertyStatus: { type: String, trim: true },
    location: { type: String, trim: true },
    channel: {
      type: String,
      enum: ["CRE_CLO", "CMBS", "Warehouse", "Non-Conforming"],
      required: true,
    },
    originationDate: { type: Date, required: true },
    maturityDate: { type: Date, required: true },
    termMonths: { type: Number, required: true, min: 1 },
    balance: { type: Schema.Types.Decimal128, required: true },
    propertyValue: { type: Schema.Types.Decimal128 },
    lvr: { type: Schema.Types.Decimal128 },
    noi: { type: Schema.Types.Decimal128 },
    ncf: { type: Schema.Types.Decimal128 },
    icr: { type: Schema.Types.Decimal128 },
    dscr: { type: Schema.Types.Decimal128 },
    wale: { type: Schema.Types.Decimal128 },
    internalScore: { type: Number },
    internalGrade: { type: String, trim: true },
    fitchIndicative: { type: String, trim: true },
    moodysIndicative: { type: String, trim: true },
    binding: { type: String, trim: true },
    creditSpreadBps: { type: Number },
    nimDefaultBps: { type: Number },
    nimNegFloorBps: { type: Number },
    nimHardFloorBps: { type: Number },
    marginBps: { type: Number },
    bbsw1mBps: { type: Number },
    allInBps: { type: Number },
    allInPct: { type: Schema.Types.Decimal128 },
    annualInterest: { type: Schema.Types.Decimal128 },
    includeInRevenue: { type: Boolean, default: true, required: true },
  },
  { timestamps: true },
);

loanSchema.index({ scenarioId: 1, channel: 1 });
loanSchema.index({ scenarioId: 1, loanId: 1 }, { unique: true });
loanSchema.index({ scenarioId: 1, capitalProgramId: 1 });

const Loan = defineModel<ILoan>("Loan", loanSchema);

export default Loan;
