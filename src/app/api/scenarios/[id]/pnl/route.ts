import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Driver, Period } from "@/models";
import { computePnL, type RecurringRevenueDriverInput } from "@/engine/pnl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  await connectToDatabase();
  const [drivers, periods] = await Promise.all([
    Driver.find({ scenarioId: id }).lean(),
    Period.find({}).sort({ index: 1 }).lean(),
  ]);
  if (periods.length === 0) {
    return NextResponse.json({ error: "periods not seeded — run `npm run seed`" }, { status: 412 });
  }
  const horizon = periods.map((p) => p.key);
  const driverInputs: RecurringRevenueDriverInput[] = drivers.map((d) => ({
    id: String(d._id),
    name: d.name,
    accountCode: d.accountCode,
    startPeriodKey: d.startPeriodKey,
    baseMonthly: d.baseMonthly.toString(),
    monthlyGrowthPct: d.monthlyGrowthPct.toString(),
  }));
  const pnl = computePnL(driverInputs, horizon);
  return NextResponse.json({
    horizon: pnl.horizon,
    lines: pnl.lines.map((l) => ({
      accountCode: l.accountCode,
      driverIds: l.driverIds,
      monthly: l.monthly.map((m) => ({ periodKey: m.periodKey, value: m.value.toFixed(2) })),
      total: l.total.toFixed(2),
    })),
    revenueTotal: pnl.revenueTotal.toFixed(2),
  });
}
