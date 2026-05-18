import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Headcount, Scenario } from "@/models";
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
  const d = parsed.data;

  let cpi = d.salaryGrowthPctAnnual;
  let superPct = d.superPct;
  if (cpi === undefined || superPct === undefined) {
    const scenario = await Scenario.findById(id)
      .select("defaultCpiPct defaultSuperPct")
      .lean<{
        defaultCpiPct?: { toString: () => string };
        defaultSuperPct?: { toString: () => string };
      }>();
    if (cpi === undefined) cpi = scenario?.defaultCpiPct?.toString() ?? "0";
    if (superPct === undefined) superPct = scenario?.defaultSuperPct?.toString() ?? "12";
  }

  const hc = await Headcount.create({
    scenarioId: new Types.ObjectId(id),
    personName: d.personName,
    role: d.role,
    accountCode: d.accountCode,
    employmentType: d.employmentType,
    ftePct: toDecimal128(d.ftePct),
    band: d.band,
    tier: d.tier,
    startPeriodKey: d.startPeriodKey,
    endPeriodKey: d.endPeriodKey,
    salaryAnnual: toDecimal128(d.salaryAnnual),
    superPct: toDecimal128(superPct),
    onCostPct: toDecimal128(d.onCostPct),
    salaryGrowthPctAnnual: toDecimal128(cpi),
  });
  return NextResponse.json({ headcount: hc }, { status: 201 });
}
