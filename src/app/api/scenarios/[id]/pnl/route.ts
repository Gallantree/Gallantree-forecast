import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { Period } from "@/models";
import { computePnL, type PnLSection } from "@/engine/pnl";
import { loadEngineInputs } from "@/engine/inputs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function serializeSection(s: PnLSection) {
  return {
    lines: s.lines.map((l) => ({
      accountCode: l.accountCode,
      driverIds: l.driverIds,
      monthly: l.monthly.map((m) => ({ periodKey: m.periodKey, value: m.value.toFixed(2) })),
      total: l.total.toFixed(2),
    })),
    totals: s.totals.map((m) => ({ periodKey: m.periodKey, value: m.value.toFixed(2) })),
    total: s.total.toFixed(2),
  };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  await connectToDatabase();
  const [periods, inputs] = await Promise.all([
    Period.find({}).sort({ index: 1 }).lean(),
    loadEngineInputs(id),
  ]);
  if (periods.length === 0) {
    return NextResponse.json({ error: "periods not seeded — run `npm run seed`" }, { status: 412 });
  }
  const horizon = periods.map((p) => p.key);
  const pnl = computePnL(inputs.drivers, inputs.headcount, horizon);
  return NextResponse.json({
    horizon: pnl.horizon,
    revenue: serializeSection(pnl.revenue),
    opex: serializeSection(pnl.opex),
    grossProfit: pnl.grossProfit.map((m) => ({ periodKey: m.periodKey, value: m.value.toFixed(2) })),
    grossProfitTotal: pnl.grossProfitTotal.toFixed(2),
  });
}
