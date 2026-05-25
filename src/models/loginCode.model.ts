import { Schema } from "mongoose";
import { defineModel } from "./_define";

export interface ILoginCode {
  email: string;
  codeHash: string;
  codeSalt: string;
  // The plaintext Auth.js magic-link URL captured at send time. On successful
  // code verification we hand this URL back to the browser, which then follows
  // it to /api/auth/callback/email — Auth.js consumes the underlying
  // verification_token and issues the session cookie. Storing the URL here is
  // no worse than the email already in the user's inbox.
  loginUrl: string;
  expiresAt: Date;
  attempts: number;
  consumedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const loginCodeSchema = new Schema<ILoginCode>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },
    codeSalt: { type: String, required: true },
    loginUrl: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL — Mongo prunes consumed/expired rows automatically a few minutes after
// expiresAt passes. Keeps the collection bounded without a cron.
loginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginCode = defineModel<ILoginCode>("LoginCode", loginCodeSchema);
export default LoginCode;
