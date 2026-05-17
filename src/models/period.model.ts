import mongoose, { Schema } from "mongoose";

export interface IPeriod {
  key: string;
  year: number;
  month: number;
  quarter: number;
  fiscalYear: number;
  index: number;
  createdAt: Date;
  updatedAt: Date;
}

const periodSchema = new Schema<IPeriod>(
  {
    key: { type: String, required: true, unique: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },
    quarter: { type: Number, required: true, min: 1, max: 4 },
    fiscalYear: { type: Number, required: true },
    index: { type: Number, required: true, unique: true },
  },
  { timestamps: true },
);

periodSchema.index({ year: 1, month: 1 }, { unique: true });

const Period =
  mongoose.models.Period || mongoose.model<IPeriod>("Period", periodSchema);

export default Period;
