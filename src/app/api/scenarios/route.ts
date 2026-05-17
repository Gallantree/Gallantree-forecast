import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Scenario } from "@/models";
import { scenarioCreateSchema } from "@/schemas/scenarioSchemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await connectToDatabase();
  const scenarios = await Scenario.find({}).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ scenarios });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = scenarioCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  await connectToDatabase();
  const scenario = await Scenario.create(parsed.data);
  return NextResponse.json({ scenario }, { status: 201 });
}
