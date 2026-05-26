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
import type { SeedProgramConfig } from "@/app/scenarios/[id]/_components/SeedConfigModal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

// ── Config → override user message ──────────────────────────────────────────

function buildConfigUserMessage(kind: string, config: SeedProgramConfig): string {
  const rows = config.rows;
  const n = rows.length;

  const rowLines = rows
    .map((r, i) => {
      const base = `${i + 1}. Name: "${r.name}", dealSize: "${r.dealSize}", startPeriodKey: "${r.startPeriodKey}", endPeriodKey: "${r.endPeriodKey}"`;
      if (kind === "cmbs" && r.collateralType) {
        const label = r.collateralType === "cre" ? "CRE-backed" : "Corporate-backed";
        return `${base}, collateral: "${label}"`;
      }
      return base;
    })
    .join("\n");

  switch (kind) {
    case "cre-clo":
      return `Generate EXACTLY ${n} CRE CLO programs with these specific names, sizes, and dates (override the counts and dates in the system prompt). For fees, tranches, and spreads follow the system prompt exactly.

Programs:
${rowLines}

Program 1 is the anchor deal — use EXACT fees and tranche values from the system prompt for program 1. For programs 2+, randomize tranche spreads within the documented bands. All programs share the same upfront fees ($500k underwriter, $900k legal, $300k ratings).`;

    case "cmbs":
      return `Generate EXACTLY ${n} CMBS programs. For fees, tranches, and spreads follow the system prompt. Override the names, sizes, dates, and collateral types:

Programs:
${rowLines}

For CRE-backed programs use CRE spread bands; for Corporate-backed programs use the wider Corporate-backed spread bands from the system prompt.`;

    case "bsl":
      return `Generate EXACTLY ${n} BSL CLO programs with these specific details. Follow system prompt for fees/tranches/spreads:

Programs:
${rowLines}`;

    case "warehouses":
      return `Generate EXACTLY ${n} warehouse facilities. Follow system prompt structure:

Programs:
${rowLines}`;

    case "enhanced-funds":
      return `Generate EXACTLY ${n} Enhanced Income Fund programs. Follow system prompt for MIS structure and fees:

Programs:
${rowLines}`;

    default:
      return `Generate EXACTLY ${n} programs with these specific details:\n${rowLines}`;
  }
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

type DispatchFn = (scenarioId: string, config?: SeedProgramConfig) => Promise<SeedResult>;

function makeAiDispatch(
  fn: (id: string, msg?: string) => Promise<SeedResult>,
  kind: string,
): DispatchFn {
  return (id, cfg) => {
    const msg = cfg && cfg.rows.length > 0 ? buildConfigUserMessage(kind, cfg) : undefined;
    return fn(id, msg);
  };
}

const DISPATCH: Record<string, DispatchFn> = {
  "cre-clo": makeAiDispatch(seedCreCloPrograms, "cre-clo"),
  cmbs: makeAiDispatch(seedCmbsPrograms, "cmbs"),
  bsl: makeAiDispatch(seedBslPrograms, "bsl"),
  warehouses: makeAiDispatch(seedWarehousePrograms, "warehouses"),
  // Enhanced funds is deterministic — pass config rows directly
  "enhanced-funds": (id, cfg) => seedEnhancedIncomeFunds(id, undefined, cfg?.rows),
  "loan-book": (id) => seedLoanBook(id),
};

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let kind: string;
  let config: SeedProgramConfig | undefined;
  try {
    const body = (await req.json()) as { kind?: unknown; config?: unknown };
    kind = typeof body.kind === "string" ? body.kind : "";
    // Loosely validate config shape — rows array with at least one entry
    if (
      body.config &&
      typeof body.config === "object" &&
      "rows" in body.config &&
      Array.isArray((body.config as { rows: unknown }).rows)
    ) {
      config = body.config as SeedProgramConfig;
    }
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
        result = await fn(id, config);
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
