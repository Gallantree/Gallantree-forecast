// Server-side helpers for recording login activity. Imported by the verify-code
// route and the Auth.js `events.signIn` callback in auth.ts.

import type { Types } from "mongoose";
import { headers } from "next/headers";
import { connectToDatabase } from "@/lib/db";
import type { LoginMethod, LoginOutcome } from "@/models";
import { LoginActivity, User } from "@/models";

// Lightweight UA parsing — avoids pulling in `ua-parser-js`. Order matters
// (Edge before Chrome, Chrome before Safari, etc.) because user-agent strings
// overlap.
function parseBrowser(ua: string): string | undefined {
  if (!ua) return undefined;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return undefined;
}

function parseOs(ua: string): string | undefined {
  if (!ua) return undefined;
  if (/Windows NT/i.test(ua)) return "Windows";
  // iOS before macOS — iPhone/iPad UAs contain "like Mac OS X".
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return undefined;
}

/** Pull caller IP from common proxy headers. Heroku/Vercel both set x-forwarded-for. */
function extractIp(h: Headers): string | undefined {
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim();
  return h.get("x-real-ip") ?? undefined;
}

export type RecordLoginOpts = {
  email: string;
  method: LoginMethod;
  outcome: LoginOutcome;
  reason?: string;
  // Optional pre-extracted request context — pass these when calling from a
  // place where `headers()` won't work (e.g. NextAuth's verify-code route was
  // already-await-ed). Falls back to `next/headers` otherwise.
  ip?: string;
  userAgent?: string;
};

export async function recordLoginActivity(opts: RecordLoginOpts): Promise<void> {
  try {
    let ip = opts.ip;
    let ua = opts.userAgent;
    if (!ip || !ua) {
      try {
        const h = await headers();
        ip = ip ?? extractIp(h);
        ua = ua ?? h.get("user-agent") ?? undefined;
      } catch {
        // headers() can throw outside a request scope — fine, leave both undefined.
      }
    }
    await connectToDatabase();
    const email = opts.email.toLowerCase();
    const user = await User.findOne({ email }).select("_id").lean<{ _id: Types.ObjectId }>();
    await LoginActivity.create({
      userId: user?._id,
      email,
      method: opts.method,
      outcome: opts.outcome,
      reason: opts.reason,
      ip,
      userAgent: ua,
      browser: ua ? parseBrowser(ua) : undefined,
      os: ua ? parseOs(ua) : undefined,
    });
  } catch (err) {
    // Logging must never break authentication.
    console.warn("[recordLoginActivity] failed", err);
  }
}
