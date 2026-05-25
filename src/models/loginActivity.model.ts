import { Schema, type Types } from "mongoose";
import { defineModel } from "./_define";

export type LoginMethod = "link" | "code" | "google" | "unknown";
export type LoginOutcome = "success" | "failure";

export interface ILoginActivity {
  userId?: Types.ObjectId;
  email: string;
  method: LoginMethod;
  outcome: LoginOutcome;
  // Free-text reason for failures ("bad-code", "expired", "blocked-disabled",
  // "blocked-unknown-email", "rate-limited"). Empty for successes.
  reason?: string;
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  createdAt: Date;
  _id?: Types.ObjectId;
}

const loginActivitySchema = new Schema<ILoginActivity>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    method: {
      type: String,
      enum: ["link", "code", "google", "unknown"],
      required: true,
    },
    outcome: { type: String, enum: ["success", "failure"], required: true },
    reason: { type: String },
    ip: { type: String },
    userAgent: { type: String },
    browser: { type: String },
    os: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// 1-year TTL — long enough for audit, short enough that the collection stays bounded.
loginActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 });

const LoginActivity = defineModel<ILoginActivity>("LoginActivity", loginActivitySchema);
export default LoginActivity;
