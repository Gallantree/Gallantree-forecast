// Returns { exists: boolean } for an email. The login form pre-checks this so
// it can show a friendly "no account — contact your admin" toast instead of
// silently sending a sign-in link for an account that doesn't exist.

import { type NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// In-process rate limiter: 10 requests per minute per IP.
// Best-effort — resets on dyno restart, but sufficient to deter casual abuse.
const rl = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rl.get(ip);
  if (!entry || now > entry.resetAt) {
    rl.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let email: string;
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body?.email ?? "")
      .trim()
      .toLowerCase();
  } catch {
    return NextResponse.json({ exists: false, error: "bad request" }, { status: 400 });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ exists: false, error: "invalid email" }, { status: 400 });
  }
  await connectToDatabase();
  const found = await User.findOne({ email }).select("_id status").lean<{
    _id: unknown;
    status?: string;
  }>();
  return NextResponse.json({
    exists: Boolean(found) && found?.status !== "disabled",
  });
}
