import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Payband } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await connectToDatabase();
  const paybands = await Payband.find({}).sort({ band: 1, tier: 1 }).lean();
  return NextResponse.json({ paybands });
}
