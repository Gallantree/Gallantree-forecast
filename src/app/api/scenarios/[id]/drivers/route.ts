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
  const data = parsed.data;
  const doc: Record<string, unknown> = {
    scenarioId: new Types.ObjectId(id),
    name: data.name,
    accountCode: data.accountCode,
    type: data.type,
    startPeriodKey: data.startPeriodKey,
    endPeriodKey: data.endPeriodKey,
  };
  switch (data.type) {
    case "recurring_revenue":
    case "opex_fixed":
      doc.baseMonthly = toDecimal128(data.baseMonthly);
      doc.monthlyGrowthPct = toDecimal128(data.monthlyGrowthPct);
      break;
    case "opex_pct_revenue":
      doc.pctOfRevenue = toDecimal128(data.pctOfRevenue);
      break;
    case "fee_x_volume":
      doc.feeBps = toDecimal128(data.feeBps);
      doc.volumeMonthly = toDecimal128(data.volumeMonthly);
      doc.volumeMonthlyGrowthPct = toDecimal128(data.volumeMonthlyGrowthPct);
      break;
    case "one_off":
      doc.amount = toDecimal128(data.amount);
      doc.periodKey = data.periodKey;
      break;
    case "opex_per_fte":
      doc.costPerFteMonthly = toDecimal128(data.costPerFteMonthly);
      break;
    case "capex_straight_line":
      doc.cost = toDecimal128(data.cost);
      doc.inServicePeriodKey = data.inServicePeriodKey;
      doc.usefulLifeMonths = data.usefulLifeMonths;
      break;
  }
  const driver = await Driver.create(doc);
  return NextResponse.json({ driver }, { status: 201 });
}
