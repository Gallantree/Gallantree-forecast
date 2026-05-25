import { type NextRequest, NextResponse } from "next/server";
import {
  type SeedResult,
  seedBslPrograms,
  seedCmbsPrograms,
  seedCreCloPrograms,
  seedEnhancedIncomeFunds,
  seedLoanBook,
  seedWarehousePrograms,
} from "@/app/scenarios/[id]/_actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

const DISPATCH: Record<string, (scenarioId: string) => Promise<SeedResult>> = {
  "cre-clo": seedCreCloPrograms,
  cmbs: seedCmbsPrograms,
  bsl: seedBslPrograms,
  warehouses: seedWarehousePrograms,
  "enhanced-funds": seedEnhancedIncomeFunds,
  "loan-book": seedLoanBook,
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let kind: string;
  try {
    const body = (await req.json()) as { kind?: unknown };
    kind = typeof body.kind === "string" ? body.kind : "";
  } catch {
    return NextResponse.json({ ok: false, error: "invalid body" }, { status: 400 });
  }
  const fn = DISPATCH[kind];
  if (!fn) {
    return NextResponse.json({ ok: false, error: `unknown seed kind: ${kind}` }, { status: 400 });
  }

  // Stream heartbeat bytes so Heroku's 30s router timeout doesn't fire while
  // the underlying AI call is in flight. The final line is the SeedResult as
  // NDJSON; clients should parse the last non-empty line.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Flush a byte immediately so the response starts before the 30s window.
      controller.enqueue(encoder.encode(" "));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(" "));
        } catch {
          // Controller may already be closed if the client disconnected.
        }
      }, 10_000);
      let result: SeedResult;
      try {
        result = await fn(id);
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
      clearInterval(heartbeat);
      controller.enqueue(encoder.encode(`\n${JSON.stringify(result)}\n`));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
