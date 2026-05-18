import { NextResponse, type NextRequest } from "next/server";
import mongoose, { Types } from "mongoose";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { Scenario, Driver, Headcount } from "@/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const branchBodySchema = z.object({ name: z.string().min(1).max(120) });

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "invalid scenario id" }, { status: 400 });
  }
  const body = await request.json();
  const parsed = branchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  await connectToDatabase();
  const parent = await Scenario.findById(id);
  if (!parent) {
    return NextResponse.json({ error: "parent scenario not found" }, { status: 404 });
  }

  // Transactions require a replica set; Atlas has one, local standalone Mongo doesn't.
  let session: mongoose.ClientSession | null = null;
  try {
    session = await mongoose.startSession();
  } catch {
    session = null;
  }

  try {
    let childId: Types.ObjectId;
    const run = async () => {
      const [child] = await Scenario.create(
        [{ name: parsed.data.name, parentId: parent._id, status: "draft" }],
        session ? { session } : {},
      );
      childId = child._id as Types.ObjectId;

      const [drivers, headcount] = await Promise.all([
        Driver.find({ scenarioId: parent._id })
          .lean()
          .session(session ?? null),
        Headcount.find({ scenarioId: parent._id })
          .lean()
          .session(session ?? null),
      ]);

      const cloneDoc = <T extends { _id: unknown; createdAt?: Date; updatedAt?: Date }>(
        d: T,
      ): Omit<T, "_id" | "createdAt" | "updatedAt"> & { scenarioId: Types.ObjectId } => {
        const { _id, createdAt, updatedAt, ...rest } = d as T & {
          createdAt?: Date;
          updatedAt?: Date;
        };
        void _id;
        void createdAt;
        void updatedAt;
        return { ...(rest as object), scenarioId: child._id } as Omit<
          T,
          "_id" | "createdAt" | "updatedAt"
        > & { scenarioId: Types.ObjectId };
      };

      if (drivers.length) {
        await Driver.insertMany(drivers.map(cloneDoc), session ? { session } : {});
      }
      if (headcount.length) {
        await Headcount.insertMany(
          headcount.map(cloneDoc),
          session ? { session } : {},
        );
      }
    };

    if (session) {
      await session.withTransaction(run);
    } else {
      await run();
    }

    const created = await Scenario.findById(childId!).lean();
    return NextResponse.json({ scenario: created }, { status: 201 });
  } finally {
    if (session) await session.endSession();
  }
}
