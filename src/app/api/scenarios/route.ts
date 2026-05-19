import { type NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Scenario } from "@/models";
import { scenarioCreateSchema } from "@/schemas/scenarioSchemas";
import { toDecimal128 } from "@/utils/money";

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
  const d = parsed.data;
  const doc: Record<string, unknown> = { name: d.name };
  if (d.parentId) doc.parentId = d.parentId;
  if (d.dsoDays !== undefined) doc.dsoDays = toDecimal128(d.dsoDays);
  if (d.dpoDays !== undefined) doc.dpoDays = toDecimal128(d.dpoDays);
  if (d.taxRatePct !== undefined) doc.taxRatePct = toDecimal128(d.taxRatePct);
  if (d.openingCash !== undefined) doc.openingCash = toDecimal128(d.openingCash);
  if (d.openingEquity !== undefined) doc.openingEquity = toDecimal128(d.openingEquity);
  if (d.defaultCpiPct !== undefined) doc.defaultCpiPct = toDecimal128(d.defaultCpiPct);
  if (d.defaultSuperPct !== undefined) doc.defaultSuperPct = toDecimal128(d.defaultSuperPct);
  const scenario = await Scenario.create(doc);
  return NextResponse.json({ scenario }, { status: 201 });
}
