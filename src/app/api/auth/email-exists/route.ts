// Returns { exists: boolean } for an email. The login form pre-checks this so
// it can show a friendly "no account — contact your admin" toast instead of
// silently sending a sign-in link for an account that doesn't exist.

import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { User } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let email: string;
  try {
    const body = (await req.json()) as { email?: unknown };
    email = String(body?.email ?? "").trim().toLowerCase();
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
