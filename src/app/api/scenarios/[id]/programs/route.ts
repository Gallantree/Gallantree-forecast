import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram } from "@/models";
import { programCreateSchema } from "@/schemas/programSchemas";
import { toDecimal128 } from "@/utils/money";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  await connectToDatabase();
  const programs = await CapitalProgram.find({ scenarioId: id })
    .sort({ startPeriodKey: 1, name: 1 })
    .lean();
  return NextResponse.json({ programs });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  const body = await request.json();
  const parsed = programCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  await connectToDatabase();
  const d = parsed.data;
  const program = await CapitalProgram.create({
    scenarioId: new Types.ObjectId(id),
    name: d.name,
    type: d.type,
    dealSize: d.dealSize ? toDecimal128(d.dealSize) : undefined,
    startPeriodKey: d.startPeriodKey,
    endPeriodKey: d.endPeriodKey,
    notes: d.notes,
    fees: d.fees.map((f) => ({
      name: f.name,
      category: f.category,
      basisAmount: toDecimal128(f.basisAmount),
      feeBps: f.feeBps,
      accountCode: f.accountCode,
    })),
  });
  return NextResponse.json({ program }, { status: 201 });
}
