import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { Driver } from "@/models";
import { driverCreateSchema } from "@/schemas/driverSchemas";
import { toDecimal128 } from "@/utils/money";
import { Types } from "mongoose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  await connectToDatabase();
  const drivers = await Driver.find({ scenarioId: id }).sort({ createdAt: 1 }).lean();
  return NextResponse.json({ drivers });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  const body = await request.json();
  const parsed = driverCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  await connectToDatabase();
  const driver = await Driver.create({
    scenarioId: new Types.ObjectId(id),
    name: parsed.data.name,
    accountCode: parsed.data.accountCode,
    type: parsed.data.type,
    startPeriodKey: parsed.data.startPeriodKey,
    baseMonthly: toDecimal128(parsed.data.baseMonthly),
    monthlyGrowthPct: toDecimal128(parsed.data.monthlyGrowthPct),
  });
  return NextResponse.json({ driver }, { status: 201 });
}
