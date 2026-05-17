import { Schema } from "mongoose";
import { defineModel } from "./_define";

export type AccountType = "revenue" | "expense" | "asset" | "liability" | "equity";

export interface IAccount {
  code: string;
  name: string;
  type: AccountType;
  xeroCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<IAccount>(
  {
    code: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["revenue", "expense", "asset", "liability", "equity"],
      required: true,
    },
    xeroCode: { type: String, trim: true },
  },
  { timestamps: true },
);

const Account = defineModel<IAccount>("Account", accountSchema);

export default Account;
