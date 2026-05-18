import { NextResponse, type NextRequest } from "next/server";
import { Types } from "mongoose";
import { connectToDatabase } from "@/lib/db";
import { CapitalProgram } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string; pid: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id, pid } = await params;
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(pid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  await connectToDatabase();
  const result = await CapitalProgram.deleteOne({ _id: pid, scenarioId: id });
  return NextResponse.json({ deleted: result.deletedCount });
}
