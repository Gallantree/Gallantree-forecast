import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Headcount } from "@/models";
import { headcountCreateSchema } from "@/schemas/headcountSchemas";
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
  const headcount = await Headcount.find({ scenarioId: id }).sort({ createdAt: 1 }).lean();
  return NextResponse.json({ headcount });
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  const body = await request.json();
  const parsed = headcountCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  await connectToDatabase();
  const hc = await Headcount.create({
    scenarioId: new Types.ObjectId(id),
    role: parsed.data.role,
    accountCode: parsed.data.accountCode,
    startPeriodKey: parsed.data.startPeriodKey,
    endPeriodKey: parsed.data.endPeriodKey,
    salaryAnnual: toDecimal128(parsed.data.salaryAnnual),
    onCostPct: toDecimal128(parsed.data.onCostPct),
    salaryGrowthPctAnnual: toDecimal128(parsed.data.salaryGrowthPctAnnual),
  });
  return NextResponse.json({ headcount: hc }, { status: 201 });
}
