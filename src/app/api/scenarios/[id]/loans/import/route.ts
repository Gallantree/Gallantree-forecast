import { Types } from "mongoose";
import { type NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { parseLoanTape } from "@/lib/parseLoanTape";
import { Loan } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "expected `file` field with .xlsx upload" }, { status: 400 });
  }
  const mode = String(form.get("mode") ?? "merge"); // "merge" or "replace"

  const buffer = await file.arrayBuffer();
  const scenarioId = new Types.ObjectId(id);

  let loans: Awaited<ReturnType<typeof parseLoanTape>>;
  try {
    loans = await parseLoanTape(buffer, scenarioId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "parse failed" },
      { status: 400 },
    );
  }

  if (loans.length === 0) {
    return NextResponse.json({ error: "no valid loans parsed from file" }, { status: 400 });
  }

  await connectToDatabase();

  if (mode === "replace") {
    await Loan.deleteMany({ scenarioId });
  }

  // Upsert by (scenarioId, loanId) so re-imports update in place.
  const ops = loans.map((l) => ({
    updateOne: {
      filter: { scenarioId, loanId: l.loanId },
      update: { $set: l },
      upsert: true,
    },
  }));
  const result = await Loan.bulkWrite(ops);
  return NextResponse.json({
    parsed: loans.length,
    upserted: result.upsertedCount,
    modified: result.modifiedCount,
    mode,
  });
}
