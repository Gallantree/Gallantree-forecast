import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { recordLoginActivity } from "@/lib/loginActivity";
import {
  LOGIN_CODE_FORMAT_REGEX,
  LOGIN_CODE_MAX_ATTEMPTS,
  normalizeLoginCode,
} from "@/lib/loginCodeConstants";
import { LoginCode } from "@/models";

export const runtime = "nodejs";

function hashCode(canonicalCode: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${canonicalCode}`).digest("hex");
}

function genericFailure() {
  // One opaque message for all failure modes (no such code, expired, wrong
  // code, too many attempts) so an attacker can't distinguish.
  return NextResponse.json({ ok: false, message: "Invalid or expired code." }, { status: 400 });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return genericFailure();
  }
  const { email, code } = (body ?? {}) as { email?: unknown; code?: unknown };
  if (typeof email !== "string" || typeof code !== "string") return genericFailure();

  const normalisedEmail = email.trim().toLowerCase();
  // Uppercase first so case-insensitive input still passes the strict regex
  // (the alphabet itself is uppercase). The strict regex enforces the
  // confusable-free character set — a lenient fallback would let codes
  // containing 0/O/I/etc. through, defeating the alphabet restriction.
  const formatted = code.trim().toUpperCase();
  if (!LOGIN_CODE_FORMAT_REGEX.test(formatted)) {
    return genericFailure();
  }
  const canonical = normalizeLoginCode(formatted);

  await connectToDatabase();

  const row = await LoginCode.findOne({
    email: normalisedEmail,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .exec();

  if (!row) {
    await recordLoginActivity({
      email: normalisedEmail,
      method: "code",
      outcome: "failure",
      reason: "no-active-code",
    });
    return genericFailure();
  }

  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    await LoginCode.updateOne({ _id: row._id }, { $set: { consumedAt: new Date() } });
    await recordLoginActivity({
      email: normalisedEmail,
      method: "code",
      outcome: "failure",
      reason: "rate-limited",
    });
    return genericFailure();
  }

  const expectedHash = hashCode(canonical, row.codeSalt);
  const expectedBuf = Buffer.from(expectedHash, "hex");
  const actualBuf = Buffer.from(row.codeHash, "hex");
  const matches =
    expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);

  if (!matches) {
    await LoginCode.updateOne({ _id: row._id }, { $inc: { attempts: 1 } });
    await recordLoginActivity({
      email: normalisedEmail,
      method: "code",
      outcome: "failure",
      reason: "bad-code",
    });
    return genericFailure();
  }

  // Consume the code so it can't be reused. We deliberately leave the Auth.js
  // verification_token alive — following the returned loginUrl is what
  // actually mints the session, and Auth.js will consume the token itself.
  await LoginCode.updateOne({ _id: row._id }, { $set: { consumedAt: new Date() } });

  // Drop a short-lived cookie so the subsequent events.signIn (which fires
  // when the browser follows loginUrl) can tag the activity row as method=code
  // instead of method=link.
  const res = NextResponse.json({ ok: true, loginUrl: row.loginUrl });
  res.cookies.set("auth_method", "code", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 120,
    path: "/",
  });
  return res;
}
